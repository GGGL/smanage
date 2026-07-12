(function () {
  const APP_ENV = "dev";
  const APP_NAME = "样品采集 Dev";
  const DB_NAME = "sample-mobile-db-dev";
  const DB_VERSION = 1;
  const DEVICE = "mobile";
  const app = document.querySelector("#app");

  const state = {
    route: { name: "home" },
    projects: [],
    samples: [],
    lastSavedSample: null,
    exportFile: null,
    importFile: null,
    message: "",
    messageType: "success",
  };

  const dbApi = {
    db: null,
    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
          if (!db.objectStoreNames.contains("samples")) db.createObjectStore("samples", { keyPath: "id" });
          if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
        };
        req.onsuccess = () => {
          dbApi.db = req.result;
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    },
    all(store) {
      return new Promise((resolve, reject) => {
        const req = dbApi.db.transaction(store, "readonly").objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    put(store, value) {
      return new Promise((resolve, reject) => {
        const req = dbApi.db.transaction(store, "readwrite").objectStore(store).put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    get(store, id) {
      return new Promise((resolve, reject) => {
        const req = dbApi.db.transaction(store, "readonly").objectStore(store).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async bulkPut(store, values) {
      for (const value of values) await dbApi.put(store, value);
    },
  };

  function id(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function now() {
    return new Date().toISOString();
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

  function go(name, params = {}) {
    state.route = { name, ...params };
    state.message = "";
    state.messageType = "success";
    render();
  }

  async function refresh() {
    state.projects = (await dbApi.all("projects")).filter((item) => !item.deleted);
    state.samples = (await dbApi.all("samples")).filter((item) => !item.deleted);
    state.projects.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    state.samples.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async function ensureDefaultProject() {
    const projects = await dbApi.all("projects");
    if (projects.length) return;
    await dbApi.put("projects", {
      id: id("P"),
      name: "默认项目",
      customer: "",
      remark: "",
      status: "进行中",
      createdAt: now(),
      updatedAt: now(),
      createdByDevice: DEVICE,
      updatedByDevice: DEVICE,
      version: 1,
      deleted: false,
    });
  }

  function pageShell(title, subtitle, body, backTo) {
    return `
      <main class="app">
        <header class="topbar">
          ${backTo ? `<button class="back" data-go="${backTo}">←</button>` : ""}
          <div class="title-block">
            <h1 class="title">${title}</h1>
            <p class="subtitle">${subtitle || ""}</p>
          </div>
        </header>
        ${state.message ? `<div class="message ${state.messageType === "error" ? "error" : state.messageType === "info" ? "info" : "success"}">${escapeHtml(state.message)}</div>` : ""}
        ${body}
      </main>
    `;
  }

  function homePage() {
    const pending = state.samples.filter((s) => s.updatedByDevice === DEVICE).length;
    return pageShell(APP_NAME, "开发环境 · 个人本地使用 · 数据包同步", `
      <section class="home-actions">
        <button class="hero-button primary" data-go="entry">
          <strong>录入</strong>
          <span>拍照并登记新的样品</span>
        </button>
        <button class="hero-button" data-go="projects">
          <strong>查看</strong>
          <span>按项目查看和调整已有样品</span>
        </button>
        <button class="hero-button" data-go="sync">
          <strong>同步</strong>
          <span>导出给电脑或导入电脑同步包</span>
        </button>
      </section>
      <section class="stats">
        <div class="card stat"><b>${state.projects.length}</b><span>项目</span></div>
        <div class="card stat"><b>${state.samples.length}</b><span>样品</span></div>
        <div class="card stat"><b>${pending}</b><span>待导出记录</span></div>
        <div class="card stat"><b>${new Date().toLocaleDateString()}</b><span>今天</span></div>
      </section>
    `);
  }

  function entryPage() {
    const projectOptions = state.projects.map((project) => (
      `<option value="${project.id}" ${state.route.projectId === project.id ? "selected" : ""}>${escapeHtml(project.name)}</option>`
    )).join("");
    const projectSelectOptions = projectOptions || `<option value="">暂无已有项目</option>`;
    return pageShell("录入样品", "这条路径只负责新增采集", `
      <form class="form" id="entry-form">
        <div class="photo-picker" id="photo-picker">
          <div class="photo-empty"><b>照片</b><span>可拍照或选择手机内照片</span></div>
          <div class="photo-actions">
            <label class="photo-action primary" for="photo-camera">拍照</label>
            <label class="photo-action" for="photo-gallery">选择手机内照片</label>
          </div>
          <input class="hidden-file" id="photo-camera" type="file" accept="image/*" capture="environment" />
          <input class="hidden-file" id="photo-gallery" type="file" accept="image/*" />
        </div>
        <div class="field">
          <label>图片名称</label>
          <input name="name" required placeholder="例如：前壳样品" />
        </div>
        <div class="grid-2">
          <div class="field"><label>规格</label><input name="spec" placeholder="20mm" /></div>
          <div class="field"><label>产地</label><input name="origin" placeholder="广东" /></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>价格</label><input name="price" type="number" step="0.01" placeholder="12.5" /></div>
          <div class="field"><label>选择已有项目</label><select name="projectId">${projectSelectOptions}</select></div>
        </div>
        <div class="field">
          <label>新项目名称</label>
          <input name="newProjectName" placeholder="要新建项目时填写" autocomplete="off" />
          <span class="field-hint">填写新项目名称时，优先创建并使用新项目；不填则使用上面的已有项目。</span>
        </div>
        <div class="field"><label>备注</label><textarea name="remark" placeholder="可不填"></textarea></div>
        <button class="btn primary" type="submit">确认</button>
      </form>
    `, "home");
  }

  function entryDetailPage() {
    const sample = state.lastSavedSample;
    if (!sample) return pageShell("录入详情", "没有刚保存的记录", `<div class="empty">请先录入样品</div>`, "home");
    return pageShell("录入详情", "保存成功后的结果页", detailBody(sample) + `
      <div class="actions">
        <button class="btn soft" data-go="entry">再录一条</button>
        <button class="btn primary" data-go="home">完成</button>
      </div>
    `, null);
  }

  function projectsPage() {
    if (!state.projects.length) return pageShell("项目列表", "查看路径从项目开始", `<div class="empty">暂无项目</div>`, "home");
    const items = state.projects.map((project) => {
      const count = state.samples.filter((sample) => sample.projectId === project.id).length;
      return `
        <div class="card list-item project-list-item">
          <button class="project-open" data-project="${project.id}">
            <div class="item-main">
              <strong>${escapeHtml(project.name)}</strong>
              <span>${count} 条样品 · ${new Date(project.updatedAt).toLocaleString()}</span>
            </div>
          </button>
          <button class="edit-project-btn" data-edit-project="${project.id}" aria-label="调整项目名称">编辑</button>
        </div>
      `;
    }).join("");
    return pageShell("项目列表", "点击项目进入项目详情", `<section class="list">${items}</section>`, "home");
  }

  function projectNameDialog(project) {
    return `
      <div class="modal-mask">
        <form class="modal-card" id="project-name-form" data-id="${project.id}">
          <div class="modal-head">
            <strong>调整项目名称</strong>
            <button type="button" class="modal-close" data-close-modal>×</button>
          </div>
          <div class="field">
            <label>项目名称</label>
            <input name="projectName" value="${escapeHtml(project.name)}" required />
          </div>
          <div class="actions">
            <button class="btn" type="button" data-close-modal>取消</button>
            <button class="btn primary" type="submit">保存</button>
          </div>
        </form>
      </div>
    `;
  }

  function showProjectNameDialog(projectId) {
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) return;
    document.body.insertAdjacentHTML("beforeend", projectNameDialog(project));
    document.querySelectorAll("[data-close-modal]").forEach((el) => {
      el.addEventListener("click", closeProjectModal);
    });
    document.querySelector("#project-name-form")?.addEventListener("submit", updateProjectName);
  }

  function closeProjectModal() {
    document.querySelector(".modal-mask")?.remove();
  }

  async function updateProjectName(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const projectId = form.dataset.id;
    const project = await dbApi.get("projects", projectId);
    if (!project) return;
    const nextName = String(new FormData(form).get("projectName") || "").trim();
    if (!nextName) return;
    await dbApi.put("projects", {
      ...project,
      name: nextName,
      updatedAt: now(),
      updatedByDevice: DEVICE,
      version: (project.version || 1) + 1,
    });
    closeProjectModal();
    await refresh();
    state.message = "项目名称已更新";
    render();
  }

  function projectDetailPage(projectId) {
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) return pageShell("项目详情", "项目不存在", `<div class="empty">未找到项目</div>`, "projects");
    const samples = state.samples.filter((sample) => sample.projectId === projectId);
    const body = samples.length ? samples.map((sample) => `
      <button class="card list-item" data-sample="${sample.id}">
        <div class="item-row">
          <div class="thumb">${sample.photoData ? `<img src="${sample.photoData}" alt="" />` : ""}</div>
          <div class="item-main">
            <strong>${escapeHtml(sample.name)}</strong>
            <span>${escapeHtml(sample.spec || "未填规格")}</span>
          </div>
        </div>
      </button>
    `).join("") : `<div class="empty">这个项目还没有样品</div>`;
    return pageShell(project.name, "项目详情 · 点击样品进入具体产品详情", `
      <section class="list">${body}</section>
      <button class="btn primary add-sample-btn" data-entry-project="${project.id}">补录</button>
    `, "projects");
  }

  function sampleDetailPage(sampleId) {
    const sample = state.samples.find((item) => item.id === sampleId);
    if (!sample) return pageShell("产品详情", "样品不存在", `<div class="empty">未找到样品</div>`, "projects");
    return pageShell("产品详情", "查看路径中的具体产品详情，可调整", `
      ${detailBody(sample)}
      <form class="form" id="edit-form" data-id="${sample.id}">
        <div class="field"><label>图片名称</label><input name="name" value="${escapeHtml(sample.name)}" /></div>
        <div class="grid-2">
          <div class="field"><label>规格</label><input name="spec" value="${escapeHtml(sample.spec || "")}" /></div>
          <div class="field"><label>产地</label><input name="origin" value="${escapeHtml(sample.origin || "")}" /></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>价格</label><input name="price" type="number" step="0.01" value="${escapeHtml(sample.price || "")}" /></div>
        </div>
        <div class="field"><label>备注</label><textarea name="remark">${escapeHtml(sample.remark || "")}</textarea></div>
        <button class="btn primary" type="submit">保存调整</button>
      </form>
    `, `project:${sample.projectId}`);
  }

  function detailBody(sample) {
    const project = state.projects.find((item) => item.id === sample.projectId);
    return `
      <section class="detail-card card">
        <div class="photo-box">${sample.photoData ? `<img src="${sample.photoData}" alt="" />` : ""}</div>
        <div class="detail-row"><span>图片名称</span><b>${escapeHtml(sample.name)}</b></div>
        <div class="detail-row"><span>规格</span><b>${escapeHtml(sample.spec || "-")}</b></div>
        <div class="detail-row"><span>产地</span><b>${escapeHtml(sample.origin || "-")}</b></div>
        <div class="detail-row"><span>价格</span><b>${escapeHtml(sample.price || "-")}</b></div>
        <div class="detail-row"><span>项目</span><b>${escapeHtml(project?.name || "-")}</b></div>
      </section>
    `;
  }

  function syncPage() {
    const importInfo = state.importFile ? `
      <div class="import-confirm">
        <div>
          <strong>已选择导入包</strong>
          <p>${escapeHtml(state.importFile.name)} · ${formatFileSize(state.importFile.size)}</p>
        </div>
        <div class="actions compact">
          <button class="btn soft" id="cancel-import" type="button">取消选择</button>
          <button class="btn primary" id="confirm-import" type="button">确认导入</button>
        </div>
      </div>
    ` : "";
    return pageShell("同步中心", "只处理数据包导入和导出", `
      <section class="sync-card card">
        <div>
          <h2 class="h2">当前数据</h2>
          <p class="meta">项目 ${state.projects.length} 个 · 样品 ${state.samples.length} 条</p>
        </div>
        <button class="btn primary" id="export-package">导出给电脑</button>
        ${state.exportFile ? `
          <a class="download-link" href="${state.exportFile.url}" download="${escapeHtml(state.exportFile.name)}">
            下载导出包：${escapeHtml(state.exportFile.name)}
          </a>
          <div class="success">导出包已生成。浏览器下载后，可手动放到 dev/mobile/exports 目录归档。</div>
        ` : ""}
        <label class="btn soft file-btn" for="import-file">选择电脑同步包</label>
        <input class="hidden-file" id="import-file" type="file" accept=".zip,.json,application/zip,application/json" />
        ${importInfo}
        <div class="notice">第一版使用完整数据包双向同步；开发预览不能自动写入项目文件夹，导出包会通过浏览器下载。</div>
      </section>
    `, "home");
  }

  function render() {
    const route = state.route;
    const html = route.name === "home" ? homePage()
      : route.name === "entry" ? entryPage()
      : route.name === "entryDetail" ? entryDetailPage()
      : route.name === "projects" ? projectsPage()
      : route.name === "project" ? projectDetailPage(route.projectId)
      : route.name === "sample" ? sampleDetailPage(route.sampleId)
      : route.name === "sync" ? syncPage()
      : homePage();
    app.innerHTML = html;
    bindEvents();
  }

  function bindEvents() {
    app.querySelectorAll("[data-go]").forEach((el) => {
      el.addEventListener("click", () => {
        const target = el.dataset.go;
        if (target.startsWith("project:")) return go("project", { projectId: target.split(":")[1] });
        go(target);
      });
    });
    app.querySelectorAll("[data-project]").forEach((el) => {
      el.addEventListener("click", () => go("project", { projectId: el.dataset.project }));
    });
    app.querySelectorAll("[data-edit-project]").forEach((el) => {
      el.addEventListener("click", () => showProjectNameDialog(el.dataset.editProject));
    });
    app.querySelectorAll("[data-entry-project]").forEach((el) => {
      el.addEventListener("click", () => go("entry", { projectId: el.dataset.entryProject }));
    });
    app.querySelectorAll("[data-sample]").forEach((el) => {
      el.addEventListener("click", () => go("sample", { sampleId: el.dataset.sample }));
    });

    const entryForm = app.querySelector("#entry-form");
    if (entryForm) bindEntryForm(entryForm);

    const editForm = app.querySelector("#edit-form");
    if (editForm) bindEditForm(editForm);

    const exportButton = app.querySelector("#export-package");
    if (exportButton) exportButton.addEventListener("click", exportPackage);

    const importFile = app.querySelector("#import-file");
    if (importFile) {
      importFile.addEventListener("change", selectImportPackage);
    }

    const cancelImport = app.querySelector("#cancel-import");
    if (cancelImport) {
      cancelImport.addEventListener("click", () => {
        state.importFile = null;
        state.message = "";
        state.messageType = "success";
        render();
      });
    }

    const confirmImport = app.querySelector("#confirm-import");
    if (confirmImport) {
      confirmImport.addEventListener("click", importPackage);
    }
  }

  function bindEntryForm(form) {
    const cameraInput = app.querySelector("#photo-camera");
    const galleryInput = app.querySelector("#photo-gallery");
    form.dataset.photoData = form.dataset.photoData || "";
    const selectPhoto = async (input) => {
      const file = input.files?.[0];
      if (!file) return;
      form.dataset.photoData = await imageFileToCompressedDataUrl(file);
      input.value = "";
      updatePhotoPicker(form.dataset.photoData);
    };
    if (cameraInput) cameraInput.addEventListener("change", () => selectPhoto(cameraInput));
    if (galleryInput) galleryInput.addEventListener("change", () => selectPhoto(galleryInput));
    if (form.dataset.submitBound) return;
    form.dataset.submitBound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const project = await resolveEntryProject(
        String(data.get("newProjectName") || "").trim(),
        String(data.get("projectId") || "")
      );
      const sample = {
        id: id("S"),
        projectId: project.id,
        name: String(data.get("name") || "").trim() || "未命名样品",
        code: "",
        spec: String(data.get("spec") || "").trim(),
        origin: String(data.get("origin") || "").trim(),
        price: data.get("price") ? Number(data.get("price")) : "",
        status: "待确认",
        remark: String(data.get("remark") || "").trim(),
        photoData: form.dataset.photoData || "",
        createdAt: now(),
        updatedAt: now(),
        createdByDevice: DEVICE,
        updatedByDevice: DEVICE,
        version: 1,
        deleted: false,
      };
      await dbApi.put("samples", sample);
      await dbApi.put("projects", { ...project, updatedAt: now(), updatedByDevice: DEVICE, version: (project.version || 1) + 1 });
      state.lastSavedSample = sample;
      await refresh();
      go("entryDetail");
    });
  }

  async function resolveEntryProject(newProjectName, selectedProjectId) {
    if (!newProjectName) {
      const selected = state.projects.find((project) => project.id === selectedProjectId);
      if (selected) return selected;
    }
    return findOrCreateProject(newProjectName || "默认项目");
  }

  async function findOrCreateProject(projectName) {
    const name = projectName.trim() || "默认项目";
    const existing = state.projects.find((project) => project.name === name);
    if (existing) return existing;
    const project = {
      id: id("P"),
      name,
      customer: "",
      remark: "",
      status: "进行中",
      createdAt: now(),
      updatedAt: now(),
      createdByDevice: DEVICE,
      updatedByDevice: DEVICE,
      version: 1,
      deleted: false,
    };
    await dbApi.put("projects", project);
    state.projects = [project, ...state.projects];
    return project;
  }

  function bindEditForm(form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const sample = await dbApi.get("samples", form.dataset.id);
      if (!sample) return;
      const data = new FormData(form);
      const updated = {
        ...sample,
        name: String(data.get("name") || "").trim() || sample.name,
        spec: String(data.get("spec") || "").trim(),
        origin: String(data.get("origin") || "").trim(),
        price: data.get("price") ? Number(data.get("price")) : "",
        remark: String(data.get("remark") || "").trim(),
        updatedAt: now(),
        updatedByDevice: DEVICE,
        version: (sample.version || 1) + 1,
      };
      await dbApi.put("samples", updated);
      await refresh();
      state.message = "样品内容已保存";
      go("project", { projectId: updated.projectId });
    });
  }

  function updatePhotoPicker(photoData) {
    const picker = app.querySelector("#photo-picker");
    if (!picker) return;
    const preview = picker.querySelector(".photo-empty");
    if (!preview) return;
    preview.innerHTML = photoData
      ? `<img src="${photoData}" alt="" />`
      : `<b>照片</b><span>可拍照或选择手机内照片</span>`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function imageFileToCompressedDataUrl(file) {
    const originalDataUrl = await fileToDataUrl(file);
    if (!file.type.startsWith("image/")) return originalDataUrl;

    const image = await loadImage(originalDataUrl);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片读取失败"));
      image.src = src;
    });
  }

  async function exportPackage() {
    const projects = await dbApi.all("projects");
    const samples = await dbApi.all("samples");
    const manifest = {
      packageId: id("PKG"),
      packageType: "mobile_to_desktop",
      appEnv: APP_ENV,
      sourceDevice: DEVICE,
      exportedAt: now(),
      schemaVersion: 1,
      appVersion: "0.1.0",
    };
    const files = {
      "manifest.json": JSON.stringify(manifest, null, 2),
      "projects.json": JSON.stringify(projects, null, 2),
      "samples.json": JSON.stringify(samples.map(({ photoData, ...sample }) => sample), null, 2),
    };
    for (const sample of samples) {
      if (!sample.photoData) continue;
      files[`images/${sample.id}.jpg`] = dataUrlToBytes(sample.photoData);
    }
    const zip = makeZip(files);
    const fileName = `sample_sync_${APP_ENV}_${formatStamp(new Date())}.zip`;
    await saveBlob(zip, fileName);
    state.message = "导出包已生成";
    render();
  }

  function selectImportPackage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    state.importFile = file;
    state.message = "请确认导入包名称后再导入";
    state.messageType = "info";
    render();
  }

  async function importPackage() {
    const file = state.importFile;
    if (!file) {
      state.message = "请先选择电脑同步包";
      state.messageType = "error";
      render();
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const files = file.name.endsWith(".json")
        ? { "package.json": decodeText(bytes) }
        : readZip(bytes);
      const manifest = JSON.parse(files["manifest.json"] || "{}");
      if (manifest.appEnv && manifest.appEnv !== APP_ENV && !confirm(`这是 ${manifest.appEnv} 环境的数据包，当前是 ${APP_ENV} 环境，是否继续导入？`)) {
        return;
      }
      const projects = JSON.parse(files["projects.json"] || "[]");
      const samplesRaw = JSON.parse(files["samples.json"] || "[]");
      const samples = samplesRaw.map((sample) => {
        const imagePath = `images/${sample.id}.jpg`;
        const imageBytes = files[imagePath];
        return {
          ...sample,
          photoData: imageBytes instanceof Uint8Array ? bytesToDataUrl(imageBytes, "image/jpeg") : sample.photoData,
        };
      });
      await mergeRecords(projects, samples);
      await refresh();
      state.importFile = null;
      state.message = `导入完成：项目 ${projects.length} 个，样品 ${samples.length} 条`;
      state.messageType = "success";
      state.route = { name: "sync" };
      render();
    } catch (error) {
      state.message = `导入失败：${error.message}`;
      state.messageType = "error";
      render();
    }
  }

  async function mergeRecords(projects, samples) {
    for (const incoming of projects) {
      const current = await dbApi.get("projects", incoming.id);
      if (!current || isIncomingNewer(incoming, current)) await dbApi.put("projects", incoming);
    }
    for (const incoming of samples) {
      const current = await dbApi.get("samples", incoming.id);
      if (!current || isIncomingNewer(incoming, current)) await dbApi.put("samples", incoming);
    }
  }

  function isIncomingNewer(incoming, current) {
    if ((incoming.version || 0) !== (current.version || 0)) return (incoming.version || 0) > (current.version || 0);
    return String(incoming.updatedAt || "") > String(current.updatedAt || "");
  }

  function formatStamp(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  function formatFileSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  async function saveBlob(blob, fileName) {
    if (state.exportFile?.url) URL.revokeObjectURL(state.exportFile.url);
    const url = URL.createObjectURL(blob);
    state.exportFile = { name: fileName, url };
    const file = new File([blob], fileName, { type: "application/zip" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "样品同步包" });
        return;
      } catch (error) {
        // Keep the download link visible when system sharing is cancelled or unavailable.
      }
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  }

  function dataUrlToBytes(dataUrl) {
    const [, base64] = dataUrl.split(",");
    const bin = atob(base64 || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function bytesToDataUrl(bytes, mime) {
    let bin = "";
    for (const byte of bytes) bin += String.fromCharCode(byte);
    return `data:${mime};base64,${btoa(bin)}`;
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const [name, content] of Object.entries(files)) {
      const nameBytes = encoder.encode(name);
      const data = typeof content === "string" ? encoder.encode(content) : content;
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length + data.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      local.set(data, 30 + nameBytes.length);
      localParts.push(local);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(10, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);
      offset += local.length;
    }
    const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, centralParts.length, true);
    ev.setUint16(10, centralParts.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  function readZip(bytes) {
    const files = {};
    const decoder = new TextDecoder();
    let pos = 0;
    while (pos < bytes.length - 4) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + pos);
      const sig = view.getUint32(0, true);
      if (sig !== 0x04034b50) break;
      const method = view.getUint16(8, true);
      if (method !== 0) throw new Error("暂不支持压缩格式的数据包，请使用本应用导出的包");
      const size = view.getUint32(18, true);
      const nameLen = view.getUint16(26, true);
      const extraLen = view.getUint16(28, true);
      const nameStart = pos + 30;
      const dataStart = nameStart + nameLen + extraLen;
      const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLen));
      const data = bytes.slice(dataStart, dataStart + size);
      files[name] = name.endsWith(".json") ? decodeText(data) : data;
      pos = dataStart + size;
    }
    return files;
  }

  function decodeText(bytes) {
    const text = new TextDecoder().decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  async function init() {
    await dbApi.open();
    await ensureDefaultProject();
    await refresh();
    render();
  }

  init().catch((error) => {
    app.innerHTML = `<main class="app"><div class="notice">启动失败：${escapeHtml(error.message)}</div></main>`;
  });
})();
