const blocks = document.querySelectorAll(".canvas-block");
const modal = document.getElementById("modal");
const closeBtn = document.getElementById("CerrarModal");
const modalTitle = modal?.querySelector(".modal-title");
const body = modal?.querySelector(".dialog-body");

// Llevar control de scripts ya inyectados para evitar duplicados
const loadedScripts = new Set();

async function injectViewIntoShadow(viewPath) {
    // mostrar loader
    body.innerHTML = `<p>Cargando...</p>`;

    try {
        const res = await fetch(viewPath, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const text = await res.text();

        // Parsear la vista
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/html");

        // Preparar host para Shadow DOM dentro de .dialog-body
        body.innerHTML = ""; // limpiar
        let shadowHost = body.querySelector("#modal-shadow-host");
        if (!shadowHost) {
            shadowHost = document.createElement("div");
            shadowHost.id = "modal-shadow-host";
            body.appendChild(shadowHost);
        } else {
            shadowHost.innerHTML = "";
        }
        // Crear o reutilizar shadow root
        const shadow =
            shadowHost.shadowRoot || shadowHost.attachShadow({ mode: "open" });

        // Opcional: wrapper dentro del shadow para estilos globales de la vista
        const container = document.createElement("div");
        container.className = "view-root";
        shadow.appendChild(container);

        // 1) Inyectar estilos en el shadow (links y style)
        // <link rel="stylesheet">
        const links = Array.from(
            doc.querySelectorAll("link[rel='stylesheet'][href]")
        );
        for (const lnk of links) {
            const href = lnk.getAttribute("href");
            if (!href) continue;
            // Insertar link dentro del shadow (evita contaminar el documento)
            const linkEl = document.createElement("link");
            linkEl.rel = "stylesheet";
            linkEl.href = href;
            shadow.appendChild(linkEl);
        }
        // <style>
        const styles = Array.from(doc.querySelectorAll("style"));
        for (const st of styles) {
            const styleEl = document.createElement("style");
            styleEl.textContent = st.textContent || "";
            shadow.appendChild(styleEl);
        }

        // 2) Insertar contenido de la vista dentro del container
        // Preferir contenedor .view o <main> si existe
        const viewContainer =
            doc.querySelector(".view") || doc.querySelector("main") || doc.body;
        container.innerHTML = viewContainer
            ? viewContainer.innerHTML
            : doc.body.innerHTML;

        // 3) Ejecutar scripts de la vista (externos primero en orden, luego inline)
        const scripts = Array.from(doc.querySelectorAll("script"));
        for (const s of scripts) {
            const src = s.getAttribute("src");
            if (src) {
                if (loadedScripts.has(src)) continue;
                await new Promise((resolve, reject) => {
                    const scriptEl = document.createElement("script");
                    scriptEl.src = src;
                    scriptEl.async = false; // mantener orden
                    scriptEl.onload = () => {
                        loadedScripts.add(src);
                        resolve();
                    };
                    scriptEl.onerror = () =>
                        reject(new Error(`Error cargando script ${src}`));
                    document.body.appendChild(scriptEl);
                });
            } else {
                const inline = s.textContent || "";
                if (!inline.trim()) continue;
                const scriptEl = document.createElement("script");
                scriptEl.textContent = inline;
                // Ejecutar en contexto global (si el script necesita acceder al shadow, deberá usar document.querySelector('#modal-shadow-host').shadowRoot)
                document.body.appendChild(scriptEl);
            }
        }
    } catch (err) {
        console.error("Error cargando vista:", err);
        body.innerHTML = `<p>Error al cargar el contenido. Comprueba la ruta: ${viewPath}</p>`;
    }
}

// Si no hay modal no seguimos
if (!modal || !body) {
    console.warn(
        "No se encontró <dialog id='modal'> o .dialog-body en el DOM."
    );
} else {
    blocks.forEach((block) => {
        // eliminar onclick inline por seguridad si existiera
        block.removeAttribute("onclick");

        block.addEventListener("click", async (e) => {
            const title =
                block.querySelector("h2")?.textContent?.trim() || "Contenido";
            if (modalTitle) modalTitle.textContent = title;

            const view = block.dataset.view; // ruta a la vista opcional
            if (view) {
                await injectViewIntoShadow(view);
            } else {
                // fallback: usar el contenido inline de .block-content (sin shadow)
                body.innerHTML =
                    block.querySelector(".block-content")?.innerHTML ||
                    `<p>Editar contenido de "${title}"</p>`;
            }

            modal.showModal();
        });
    });

    // Cerrar desde botón (evitar burbujeo)
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            modal.close();
        });
    }

    // Cerrar al clicar en el backdrop (clic sobre el dialog propiamente)
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.close();
    });

    // Cerrar con Escape (evento cancel se dispara con ESC)
    modal.addEventListener("cancel", (e) => {
        modal.close();
    });
}
