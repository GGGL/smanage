from __future__ import annotations

import json
import mimetypes
import shutil
import sqlite3
import sys
import threading
import time
import webbrowser
import zipfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "samples.db"
IMAGE_DIR = DATA_DIR / "images"
BACKUP_DIR = DATA_DIR / "backups"
EXPORT_DIR = DATA_DIR / "exports"
HOST = "127.0.0.1"
PORT = 8765


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for path in (DATA_DIR, IMAGE_DIR, BACKUP_DIR, EXPORT_DIR):
        path.mkdir(parents=True, exist_ok=True)


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    ensure_dirs()
    with db() as conn:
        conn.execute(
            """
            create table if not exists projects (
              id text primary key,
              name text not null,
              customer text default '',
              remark text default '',
              status text default '进行中',
              created_at text not null,
              updated_at text not null,
              created_by_device text default '',
              updated_by_device text default '',
              version integer default 1,
              deleted integer default 0
            )
            """
        )
        conn.execute(
            """
            create table if not exists samples (
              id text primary key,
              project_id text not null,
              name text not null,
              code text default '',
              spec text default '',
              origin text default '',
              price real,
              status text default '待确认',
              remark text default '',
              photo_file text default '',
              created_at text not null,
              updated_at text not null,
              created_by_device text default '',
              updated_by_device text default '',
              version integer default 1,
              deleted integer default 0
            )
            """
        )
        conn.execute(
            """
            create table if not exists sync_logs (
              id integer primary key autoincrement,
              action text not null,
              summary text not null,
              created_at text not null
            )
            """
        )


def row_to_project(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "customer": row["customer"],
        "remark": row["remark"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "createdByDevice": row["created_by_device"],
        "updatedByDevice": row["updated_by_device"],
        "version": row["version"],
        "deleted": bool(row["deleted"]),
    }


def row_to_sample(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "name": row["name"],
        "code": row["code"],
        "spec": row["spec"],
        "origin": row["origin"],
        "price": row["price"] if row["price"] is not None else "",
        "status": row["status"],
        "remark": row["remark"],
        "photoFiles": [row["photo_file"]] if row["photo_file"] else [],
        "photoUrl": f"/images/{row['photo_file']}" if row["photo_file"] else "",
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "createdByDevice": row["created_by_device"],
        "updatedByDevice": row["updated_by_device"],
        "version": row["version"],
        "deleted": bool(row["deleted"]),
    }


def upsert_project(conn: sqlite3.Connection, project: dict) -> str:
    current = conn.execute("select * from projects where id = ?", (project["id"],)).fetchone()
    incoming_version = int(project.get("version") or 1)
    incoming_updated = project.get("updatedAt") or utc_now()
    if current and not is_incoming_newer(incoming_version, incoming_updated, current["version"], current["updated_at"]):
        return "skipped"
    conn.execute(
        """
        insert into projects (id, name, customer, remark, status, created_at, updated_at, created_by_device,
          updated_by_device, version, deleted)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          name = excluded.name,
          customer = excluded.customer,
          remark = excluded.remark,
          status = excluded.status,
          updated_at = excluded.updated_at,
          updated_by_device = excluded.updated_by_device,
          version = excluded.version,
          deleted = excluded.deleted
        """,
        (
            project["id"],
            project.get("name") or "未命名项目",
            project.get("customer") or "",
            project.get("remark") or "",
            project.get("status") or "进行中",
            project.get("createdAt") or incoming_updated,
            incoming_updated,
            project.get("createdByDevice") or "",
            project.get("updatedByDevice") or "",
            incoming_version,
            1 if project.get("deleted") else 0,
        ),
    )
    return "updated" if current else "created"


def upsert_sample(conn: sqlite3.Connection, sample: dict, photo_file: str = "") -> str:
    current = conn.execute("select * from samples where id = ?", (sample["id"],)).fetchone()
    incoming_version = int(sample.get("version") or 1)
    incoming_updated = sample.get("updatedAt") or utc_now()
    if current and not is_incoming_newer(incoming_version, incoming_updated, current["version"], current["updated_at"]):
        return "skipped"
    if not photo_file and current:
        photo_file = current["photo_file"]
    conn.execute(
        """
        insert into samples (id, project_id, name, code, spec, origin, price, status, remark, photo_file,
          created_at, updated_at, created_by_device, updated_by_device, version, deleted)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          project_id = excluded.project_id,
          name = excluded.name,
          code = excluded.code,
          spec = excluded.spec,
          origin = excluded.origin,
          price = excluded.price,
          status = excluded.status,
          remark = excluded.remark,
          photo_file = excluded.photo_file,
          updated_at = excluded.updated_at,
          updated_by_device = excluded.updated_by_device,
          version = excluded.version,
          deleted = excluded.deleted
        """,
        (
            sample["id"],
            sample.get("projectId") or sample.get("project_id"),
            sample.get("name") or "未命名样品",
            sample.get("code") or "",
            sample.get("spec") or "",
            sample.get("origin") or "",
            normalize_price(sample.get("price")),
            sample.get("status") or "待确认",
            sample.get("remark") or "",
            photo_file,
            sample.get("createdAt") or incoming_updated,
            incoming_updated,
            sample.get("createdByDevice") or "",
            sample.get("updatedByDevice") or "",
            incoming_version,
            1 if sample.get("deleted") else 0,
        ),
    )
    return "updated" if current else "created"


def normalize_price(value):
    if value in ("", None):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def is_incoming_newer(in_version: int, in_updated: str, cur_version: int, cur_updated: str) -> bool:
    if in_version != cur_version:
        return in_version > cur_version
    return in_updated > cur_updated


def backup_db() -> None:
    if not DB_PATH.exists():
        return
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    shutil.copy2(DB_PATH, BACKUP_DIR / f"samples_{stamp}.db")


def import_package(package_bytes: bytes) -> dict:
    backup_db()
    counts = {"projects_created": 0, "projects_updated": 0, "samples_created": 0, "samples_updated": 0, "skipped": 0}
    with zipfile.ZipFile(BytesReader(package_bytes)) as zf, db() as conn:
        projects = json.loads(zf.read("projects.json").decode("utf-8-sig")) if "projects.json" in zf.namelist() else []
        samples = json.loads(zf.read("samples.json").decode("utf-8-sig")) if "samples.json" in zf.namelist() else []
        for project in projects:
            result = upsert_project(conn, project)
            increment(counts, "projects", result)
        names = set(zf.namelist())
        for sample in samples:
            photo_file = ""
            image_candidates = [f"images/{sample.get('id')}.jpg", *sample.get("photoFiles", [])]
            for image_name in image_candidates:
                if image_name in names:
                    suffix = Path(image_name).suffix or ".jpg"
                    photo_file = f"{sample.get('id')}{suffix}"
                    (IMAGE_DIR / photo_file).write_bytes(zf.read(image_name))
                    break
            result = upsert_sample(conn, sample, photo_file)
            increment(counts, "samples", result)
        conn.execute("insert into sync_logs (action, summary, created_at) values (?, ?, ?)", ("import", json.dumps(counts, ensure_ascii=False), utc_now()))
    return counts


def increment(counts: dict, scope: str, result: str) -> None:
    if result == "created":
        counts[f"{scope}_created"] += 1
    elif result == "updated":
        counts[f"{scope}_updated"] += 1
    else:
        counts["skipped"] += 1


class BytesReader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def read(self, size=-1):
        if size < 0:
            size = len(self.data) - self.pos
        chunk = self.data[self.pos : self.pos + size]
        self.pos += len(chunk)
        return chunk

    def seek(self, offset, whence=0):
        if whence == 0:
            self.pos = offset
        elif whence == 1:
            self.pos += offset
        elif whence == 2:
            self.pos = len(self.data) + offset
        return self.pos

    def tell(self):
        return self.pos

    def seekable(self):
        return True


def export_package() -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = EXPORT_DIR / f"sample_sync_desktop_{stamp}.zip"
    with db() as conn, zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as zf:
        projects = [row_to_project(row) for row in conn.execute("select * from projects where deleted = 0 order by updated_at desc")]
        samples = [row_to_sample(row) for row in conn.execute("select * from samples where deleted = 0 order by updated_at desc")]
        manifest = {
            "packageId": f"PKG-{stamp}-desktop",
            "packageType": "desktop_to_mobile",
            "sourceDevice": "desktop",
            "exportedAt": utc_now(),
            "schemaVersion": 1,
            "appVersion": "0.1.0",
        }
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        zf.writestr("projects.json", json.dumps(projects, ensure_ascii=False, indent=2))
        zf.writestr("samples.json", json.dumps(samples, ensure_ascii=False, indent=2))
        for sample in samples:
            for photo_file in sample.get("photoFiles", []):
                src = IMAGE_DIR / Path(photo_file).name
                if src.exists():
                    zf.write(src, f"images/{sample['id']}{src.suffix}")
        conn.execute("insert into sync_logs (action, summary, created_at) values (?, ?, ?)", ("export", path.name, utc_now()))
    return path


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/":
            self.serve_file(STATIC_DIR / "index.html")
        elif path.startswith("/static/"):
            self.serve_file(STATIC_DIR / path.removeprefix("/static/"))
        elif path.startswith("/images/"):
            self.serve_file(IMAGE_DIR / Path(unquote(path.removeprefix("/images/"))).name)
        elif path == "/api/projects":
            self.json(project_summaries(parsed.query))
        elif path.startswith("/api/projects/") and path.endswith("/samples"):
            project_id = unquote(path.split("/")[3])
            self.json(project_samples(project_id, parsed.query))
        elif path.startswith("/api/projects/"):
            project_id = unquote(path.split("/")[3])
            project = get_project(project_id)
            self.json(project or {}, status=200 if project else 404)
        elif path.startswith("/api/samples/"):
            sample_id = unquote(path.split("/")[3])
            sample = get_sample(sample_id)
            self.json(sample or {}, status=200 if sample else 404)
        elif path == "/api/export":
            export_path = export_package()
            self.serve_download(export_path)
        elif path == "/api/logs":
            self.json(sync_logs())
        else:
            self.send_error(404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/import":
            length = int(self.headers.get("content-length") or 0)
            data = self.rfile.read(length)
            try:
                result = import_package(data)
                self.json({"ok": True, "result": result})
            except Exception as exc:
                self.json({"ok": False, "error": str(exc)}, status=400)
        elif parsed.path == "/api/projects":
            payload = self.read_json()
            project_id = f"P-{int(time.time() * 1000)}"
            record = {
                "id": project_id,
                "name": payload.get("name") or "新项目",
                "customer": payload.get("customer") or "",
                "remark": payload.get("remark") or "",
                "status": payload.get("status") or "进行中",
                "createdAt": utc_now(),
                "updatedAt": utc_now(),
                "createdByDevice": "desktop",
                "updatedByDevice": "desktop",
                "version": 1,
                "deleted": False,
            }
            with db() as conn:
                upsert_project(conn, record)
            self.json(record)
        else:
            self.send_error(404)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/samples/"):
            sample_id = unquote(parsed.path.split("/")[3])
            payload = self.read_json()
            with db() as conn:
                current = conn.execute("select * from samples where id = ?", (sample_id,)).fetchone()
                if not current:
                    self.json({"error": "sample not found"}, status=404)
                    return
                record = row_to_sample(current)
                record.update(payload)
                record["id"] = sample_id
                record["projectId"] = record.get("projectId") or current["project_id"]
                record["updatedAt"] = utc_now()
                record["updatedByDevice"] = "desktop"
                record["version"] = int(record.get("version") or 1) + 1
                upsert_sample(conn, record, current["photo_file"])
            self.json(get_sample(sample_id))
        elif parsed.path.startswith("/api/projects/"):
            project_id = unquote(parsed.path.split("/")[3])
            payload = self.read_json()
            with db() as conn:
                current = conn.execute("select * from projects where id = ?", (project_id,)).fetchone()
                if not current:
                    self.json({"error": "project not found"}, status=404)
                    return
                record = row_to_project(current)
                record.update(payload)
                record["id"] = project_id
                record["updatedAt"] = utc_now()
                record["updatedByDevice"] = "desktop"
                record["version"] = int(record.get("version") or 1) + 1
                upsert_project(conn, record)
            self.json(get_project(project_id))
        else:
            self.send_error(404)

    def read_json(self) -> dict:
        length = int(self.headers.get("content-length") or 0)
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def serve_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def serve_download(self, path: Path) -> None:
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("content-type", "application/zip")
        self.send_header("content-disposition", f'attachment; filename="{path.name}"')
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def json(self, data, status=200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        return


def project_summaries(query: str) -> list[dict]:
    keyword = parse_qs(query).get("q", [""])[0].strip()
    params = []
    where = "where p.deleted = 0"
    if keyword:
        where += " and p.name like ?"
        params.append(f"%{keyword}%")
    with db() as conn:
        rows = conn.execute(
            f"""
            select p.*, count(s.id) as sample_count
            from projects p
            left join samples s on s.project_id = p.id and s.deleted = 0
            {where}
            group by p.id
            order by p.updated_at desc
            """,
            params,
        ).fetchall()
    result = []
    for row in rows:
        item = row_to_project(row)
        item["sampleCount"] = row["sample_count"]
        result.append(item)
    return result


def get_project(project_id: str) -> dict | None:
    with db() as conn:
        row = conn.execute("select * from projects where id = ? and deleted = 0", (project_id,)).fetchone()
    return row_to_project(row) if row else None


def project_samples(project_id: str, query: str) -> list[dict]:
    keyword = parse_qs(query).get("q", [""])[0].strip()
    params = [project_id]
    where = "where project_id = ? and deleted = 0"
    if keyword:
        where += " and (name like ? or spec like ? or origin like ?)"
        params.extend([f"%{keyword}%"] * 3)
    with db() as conn:
        rows = conn.execute(f"select * from samples {where} order by updated_at desc", params).fetchall()
    return [row_to_sample(row) for row in rows]


def get_sample(sample_id: str) -> dict | None:
    with db() as conn:
        row = conn.execute("select * from samples where id = ? and deleted = 0", (sample_id,)).fetchone()
    return row_to_sample(row) if row else None


def sync_logs() -> list[dict]:
    with db() as conn:
        rows = conn.execute("select * from sync_logs order by created_at desc limit 20").fetchall()
    return [dict(row) for row in rows]


def main() -> None:
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}/"
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    print(f"样品管理电脑端已启动: {url}")
    server.serve_forever()
