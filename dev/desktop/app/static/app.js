const app = document.querySelector("#app");

const state = {
  page: "projects",
  env: null,
  projects: [],
  project: null,
  samples: [],
  sample: null,
  logs: [],
  q: "",
  message: "",
  modal: null,
};

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const type = res.headers.get("content-type") || "";
  if (!res.ok) {
    const error = type.includes("json") ? await res.json() : { error: await res.text() };
    throw new Error(error.error || "请求失败");
  }
  return type.includes("json") ? res.json() : res.blob();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[char]);
}

function layout(body) {
  const count = state.projects.reduce((sum, p) => sum + (p.sampleCount || 0), 0);
  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">${escapeHtml(state.env?.appName || "样品管理")}</div>
        <div class="brand-sub">${escapeHtml(state.env?.appEnv || "dev")} · 本地整理 · 数据包同步</div>
        <nav class="nav">
          <button class="${state.page !== "sync" ? "active" : ""}" data-nav="projects">项目</button>
          <button class="${state.page === "sync" ? "active" : ""}" data-nav="sync">导入导出</button>
        </nav>
        <div class="side-stat">
          当前数据<br />
          项目 ${state.projects.length} 个<br />
          样品 ${count} 条
        </div>
      </aside>
      <main class="main">
        ${state.message ? `<div class="notice">${escapeHtml(state.message)}</div>` : ""}
        ${body}
      </main>
      ${modalHtml()}
    </div>
  `;
}

function modalHtml() {
  if (!state.modal) return "";
  if (state.modal.type === "project") {
    const project = state.modal.project || {};
    const title = project.id ? "调整项目" : "新建项目";
    return `
      <div class="modal-mask">
        <form class="modal card" id="project-form">
          <div class="modal-head">
            <h2>${title}</h2>
            <button class="icon-btn" type="button" data-action="close-modal">×</button>
          </div>
          <div class="form">
            <div class="field"><label>项目名称</label><input name="name" required value="${escapeHtml(project.name || "")}" /></div>
            <div class="grid-2">
              <div class="field"><label>客户名称</label><input name="customer" value="${escapeHtml(project.customer || "")}" /></div>
              <div class="field"><label>状态</label><select name="status">
                ${["进行中", "待整理", "已完成", "已归档"].map((status) => `<option ${project.status === status ? "selected" : ""}>${status}</option>`).join("")}
              </select></div>
            </div>
            <div class="field"><label>备注</label><textarea name="remark">${escapeHtml(project.remark || "")}</textarea></div>
          </div>
          <div class="modal-actions">
            <button class="btn" type="button" data-action="close-modal">取消</button>
            <button class="btn primary" type="submit">保存</button>
          </div>
        </form>
      </div>
    `;
  }
  return "";
}

async function loadProjects() {
  if (!state.env) state.env = await api("/api/env");
  state.projects = await api(`/api/projects?q=${encodeURIComponent(state.q)}`);
}

async function showProjects() {
  state.page = "projects";
  state.project = null;
  state.sample = null;
  await loadProjects();
  render();
}

async function showProject(projectId) {
  state.page = "project";
  state.project = await api(`/api/projects/${encodeURIComponent(projectId)}`);
  state.samples = await api(`/api/projects/${encodeURIComponent(projectId)}/samples?q=${encodeURIComponent(state.q)}`);
  render();
}

async function showSample(sampleId) {
  state.page = "sample";
  state.sample = await api(`/api/samples/${encodeURIComponent(sampleId)}`);
  render();
}

async function showSync() {
  state.page = "sync";
  state.logs = await api("/api/logs");
  await loadProjects();
  render();
}

function projectsPage() {
  const cards = state.projects.length ? state.projects.map((project) => `
    <button class="card project-card" data-project="${project.id}">
      <strong>${escapeHtml(project.name)}</strong>
      <div class="meta">${project.sampleCount || 0} 条样品 · ${new Date(project.updatedAt).toLocaleString()}</div>
      <span class="pill">${escapeHtml(project.status || "进行中")}</span>
    </button>
  `).join("") : `<div class="card empty">暂无项目，请先导入手机采集包或新建项目</div>`;
  return layout(`
    <header class="page-head">
      <div>
        <h1>项目列表</h1>
        <p class="hint">只加载项目汇总，点击项目后再加载该项目下的样品。</p>
      </div>
      <div class="toolbar">
        <input class="search" id="search" value="${escapeHtml(state.q)}" placeholder="搜索项目" />
        <button class="btn primary" id="new-project">新建项目</button>
      </div>
    </header>
    <section class="project-grid">${cards}</section>
  `);
}

function projectPage() {
  const p = state.project;
  const rows = state.samples.length ? `
    <section class="card sample-table">
      <div class="sample-table-row sample-table-head">
        <label class="check-cell">
          <input id="check-pending-all" type="checkbox" />
          <span>待确认</span>
        </label>
        <span>图片</span>
        <span>图片名称</span>
        <span>规格</span>
        <span>产地</span>
        <span>价格</span>
        <span>状态</span>
        <div class="table-actions">
          <button class="link-btn strong" id="confirm-selected" type="button">确认选中</button>
        </div>
      </div>
      ${state.samples.map((sample) => {
        const status = sample.status || "待确认";
        const isPending = status === "待确认";
        return `
          <div class="sample-table-row">
            <label class="check-cell">
              <input class="pending-check" type="checkbox" value="${sample.id}" ${isPending ? "" : "disabled"} />
            </label>
            <button class="thumb table-thumb" data-sample="${sample.id}" type="button">
              ${sample.photoUrl ? `<img src="${sample.photoUrl}" alt="" />` : ""}
            </button>
            <button class="name-cell" data-sample="${sample.id}" type="button">
              <strong>${escapeHtml(sample.name)}</strong>
              <span>${escapeHtml(sample.remark || "")}</span>
            </button>
            <span>${escapeHtml(sample.spec || "-")}</span>
            <span>${escapeHtml(sample.origin || "-")}</span>
            <span>${escapeHtml(String(sample.price || "-"))}</span>
            <span class="status ${status === "已确认" ? "ok" : ""}">${escapeHtml(status)}</span>
            <div class="table-actions">
              <button class="link-btn" data-sample="${sample.id}" type="button">查看</button>
              <button class="link-btn" data-sample="${sample.id}" type="button">修改</button>
              ${isPending ? `<button class="link-btn strong" data-confirm-sample="${sample.id}" type="button">确认</button>` : ""}
            </div>
          </div>
        `;
      }).join("")}
    </section>
  ` : `<div class="card empty">当前项目还没有样品</div>`;
  return layout(`
    <header class="page-head">
      <div>
        <button class="btn" data-action="back-projects">← 返回项目列表</button>
        <h1 style="margin-top:16px">${escapeHtml(p.name)}</h1>
        <p class="hint">只加载当前项目下的样品。</p>
      </div>
      <div class="toolbar">
        <input class="search" id="search" value="${escapeHtml(state.q)}" placeholder="搜索当前项目内样品" />
        <button class="btn soft" id="edit-project">调整项目</button>
        <button class="btn" id="export-excel">导出Excel</button>
        <button class="btn" id="export-package">导出同步包</button>
      </div>
    </header>
    ${rows}
  `);
}

function samplePage() {
  const s = state.sample;
  return layout(`
    <header class="page-head">
      <div>
        <button class="btn" data-action="back-project">← 返回项目详情</button>
        <h1 style="margin-top:16px">${escapeHtml(s.name)}</h1>
        <p class="hint">只加载当前样品完整数据和图片。</p>
      </div>
    </header>
    <section class="detail">
      <div class="card panel">
        <div class="photo">${s.photoUrl ? `<img src="${s.photoUrl}" alt="" />` : ""}</div>
      </div>
      <form class="card panel form" id="sample-form">
        <div class="field"><label>图片名称</label><input name="name" value="${escapeHtml(s.name)}" /></div>
        <div class="grid-2">
          <div class="field"><label>规格</label><input name="spec" value="${escapeHtml(s.spec || "")}" /></div>
          <div class="field"><label>产地</label><input name="origin" value="${escapeHtml(s.origin || "")}" /></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>价格</label><input name="price" type="number" step="0.01" value="${escapeHtml(s.price || "")}" /></div>
          <div class="field"><label>状态</label><select name="status">
            ${["待确认", "已确认", "已同步", "已归档"].map((status) => `<option ${s.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select></div>
        </div>
        <div class="field"><label>备注</label><textarea name="remark">${escapeHtml(s.remark || "")}</textarea></div>
        <button class="btn primary" type="submit">保存调整</button>
      </form>
    </section>
  `);
}

function syncPage() {
  const logs = state.logs.length ? state.logs.map((log) => `
    <div class="card project-card">
      <strong>${log.action === "import" ? "导入" : "导出"}</strong>
      <div class="meta">${escapeHtml(log.created_at)} · ${escapeHtml(log.summary)}</div>
    </div>
  `).join("") : `<div class="card empty">暂无导入导出记录</div>`;
  return layout(`
    <header class="page-head">
      <div>
        <h1>导入导出</h1>
        <p class="hint">导入手机采集包，或导出同步包给手机端。</p>
      </div>
      <div class="toolbar">
        <button class="btn primary" id="pick-import">导入手机包</button>
        <button class="btn soft" id="export-package">导出给手机</button>
        <input class="hidden" id="import-file" type="file" accept=".zip,application/zip" />
      </div>
    </header>
    <section class="card project-card">
      <strong>同步说明</strong>
      <div class="warn">当前环境：${escapeHtml(state.env?.appEnv || "dev")}。导入前会自动备份电脑端数据库。第一版使用完整 zip 包同步。</div>
    </section>
    <h2>最近记录</h2>
    <section class="project-grid">${logs}</section>
  `);
}

function render() {
  app.innerHTML = state.page === "projects" ? projectsPage()
    : state.page === "project" ? projectPage()
    : state.page === "sample" ? samplePage()
    : syncPage();
  bind();
}

function bind() {
  app.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => button.dataset.nav === "sync" ? showSync() : showProjects());
  });
  app.querySelectorAll("[data-project]").forEach((button) => {
    button.addEventListener("click", () => showProject(button.dataset.project));
  });
  app.querySelectorAll("[data-sample]").forEach((button) => {
    button.addEventListener("click", () => showSample(button.dataset.sample));
  });
  app.querySelectorAll("[data-confirm-sample]").forEach((button) => {
    button.addEventListener("click", () => confirmSamples([button.dataset.confirmSample]));
  });

  const checkPendingAll = app.querySelector("#check-pending-all");
  if (checkPendingAll) {
    checkPendingAll.addEventListener("change", () => {
      app.querySelectorAll(".pending-check:not(:disabled)").forEach((box) => {
        box.checked = checkPendingAll.checked;
      });
    });
  }

  const confirmSelected = app.querySelector("#confirm-selected");
  if (confirmSelected) {
    confirmSelected.addEventListener("click", () => {
      const ids = Array.from(app.querySelectorAll(".pending-check:checked")).map((box) => box.value);
      confirmSamples(ids);
    });
  }
  app.querySelectorAll("[data-action='back-projects']").forEach((button) => button.addEventListener("click", showProjects));
  app.querySelectorAll("[data-action='back-project']").forEach((button) => button.addEventListener("click", () => showProject(state.sample.projectId)));

  const search = app.querySelector("#search");
  if (search) {
    search.addEventListener("change", async () => {
      state.q = search.value.trim();
      state.page === "project" ? await showProject(state.project.id) : await showProjects();
    });
  }

  const sampleForm = app.querySelector("#sample-form");
  if (sampleForm) sampleForm.addEventListener("submit", saveSample);

  const projectForm = app.querySelector("#project-form");
  if (projectForm) projectForm.addEventListener("submit", saveProject);

  app.querySelectorAll("[data-action='close-modal']").forEach((button) => {
    button.addEventListener("click", () => {
      state.modal = null;
      render();
    });
  });

  const newProject = app.querySelector("#new-project");
  if (newProject) newProject.addEventListener("click", () => {
    state.modal = { type: "project", project: {} };
    render();
  });

  const editProject = app.querySelector("#edit-project");
  if (editProject) editProject.addEventListener("click", () => {
    state.modal = { type: "project", project: state.project };
    render();
  });

  const pickImport = app.querySelector("#pick-import");
  const importFile = app.querySelector("#import-file");
  if (pickImport && importFile) {
    pickImport.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", importPackage);
  }

  const exportPackage = app.querySelector("#export-package");
  if (exportPackage) exportPackage.addEventListener("click", () => {
    window.location.href = "/api/export";
  });

  const exportExcel = app.querySelector("#export-excel");
  if (exportExcel) exportExcel.addEventListener("click", () => {
    if (state.project?.id) window.location.href = `/api/projects/${encodeURIComponent(state.project.id)}/export-excel`;
  });
}

async function saveSample(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  await api(`/api/samples/${encodeURIComponent(state.sample.id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.fromEntries(data.entries())),
  });
  state.message = "样品内容已保存";
  await showProject(state.sample.projectId);
}

async function confirmSamples(sampleIds) {
  const ids = sampleIds.filter(Boolean);
  if (!ids.length) {
    state.message = "请先勾选待确认样品";
    render();
    return;
  }
  await Promise.all(ids.map((sampleId) => api(`/api/samples/${encodeURIComponent(sampleId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "已确认" }),
  })));
  state.message = ids.length > 1 ? `已确认 ${ids.length} 条样品` : "样品已确认";
  await showProject(state.project.id);
}

async function saveProject(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const project = state.modal?.project || {};
  if (project.id) {
    await api(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    state.message = "项目内容已调整";
    state.modal = null;
    await showProject(project.id);
  } else {
    await api("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    state.message = "项目已创建";
    state.modal = null;
    await showProjects();
  }
}

async function importPackage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await api("/api/import", {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: await file.arrayBuffer(),
    });
    state.message = "手机包导入完成";
    await showSync();
  } catch (error) {
    state.message = `导入失败：${error.message}`;
    render();
  } finally {
    event.target.value = "";
  }
}

showProjects().catch((error) => {
  app.innerHTML = `<main class="main"><div class="warn">启动失败：${escapeHtml(error.message)}</div></main>`;
});
