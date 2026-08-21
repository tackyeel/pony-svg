// Fill these values before deploying to GitHub Pages.
const GITHUB_USER = "tackyeel";
const GITHUB_REPO = "pony-svg";

const PONY_DIRECTORY = "pony";

const ponyFrame = document.querySelector("#pony-frame");
const statusText = document.querySelector("#status");
const menu = document.querySelector("#pony-menu");
const menuButton = document.querySelector("#choose-pony");
const themeButton = document.querySelector("#theme-toggle");
const themeIcon = themeButton.querySelector(".theme-icon");
const themeLabel = themeButton.querySelector(".theme-label");

let ponies = [];
let activePony = null;
let loadSequence = 0;

function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  themeIcon.textContent = isDark ? "☀" : "☾";
  themeLabel.textContent = isDark ? "Day" : "Night";
  themeButton.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  localStorage.setItem("pony-theme", theme);
}

const savedTheme = localStorage.getItem("pony-theme");
const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
setTheme(savedTheme || preferredTheme);

themeButton.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

function setMenuOpen(isOpen) {
  menu.classList.toggle("open", isOpen);
  menu.setAttribute("aria-hidden", String(!isOpen));
  menuButton.setAttribute("aria-expanded", String(isOpen));
}

// GitHub Pages uses the API. Python's local server provides a directory index,
// which is parsed as a convenient zero-configuration development fallback.
async function getPonyFiles() {
  if (GITHUB_USER && GITHUB_REPO) {
    const endpoint = `https://api.github.com/repos/${encodeURIComponent(GITHUB_USER)}/${encodeURIComponent(GITHUB_REPO)}/contents/${PONY_DIRECTORY}`;
    const response = await fetch(endpoint, {
      headers: { Accept: "application/vnd.github+json" }
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const entries = await response.json();
    return entries
      .filter((entry) => entry.type === "file" && entry.name.toLowerCase().endsWith(".svg"))
      .map((entry) => ({ name: entry.name.slice(0, -4), url: entry.download_url }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const response = await fetch(`./${PONY_DIRECTORY}/`);
  if (!response.ok) throw new Error("Could not read the local pony directory");

  const directoryDocument = new DOMParser().parseFromString(await response.text(), "text/html");
  return [...directoryDocument.querySelectorAll("a[href]")]
    .map((link) => link.getAttribute("href"))
    .filter((href) => href && href.toLowerCase().split(/[?#]/)[0].endsWith(".svg"))
    .map((href) => {
      const fileName = decodeURIComponent(href.split("/").pop().split(/[?#]/)[0]);
      return {
        name: fileName.slice(0, -4),
        url: new URL(href, response.url).href
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildPonyMenu() {
  menu.replaceChildren();

  ponies.forEach((pony) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pony-option";
    button.textContent = pony.name;
    button.setAttribute("role", "menuitem");
    button.addEventListener("click", () => showPony(pony));
    menu.append(button);
  });
}

async function showPony(pony) {
  const requestSequence = ++loadSequence;
  statusText.textContent = "Loading artwork…";
  setMenuOpen(false);

  // Each SVG gets its own document. This lets its built-in scripts restart on
  // every selection and prevents event listeners from previous ponies leaking.
  const svgObject = document.createElement("object");
  svgObject.type = "image/svg+xml";
  svgObject.data = pony.url;
  svgObject.setAttribute("role", "img");
  svgObject.setAttribute("aria-label", pony.name);

  svgObject.addEventListener("load", () => {
    if (requestSequence !== loadSequence || !svgObject.isConnected) return;
    activePony = pony;
    statusText.textContent = "";
    addSvgInteractions(svgObject);
    updateActiveButton();
  }, { once: true });

  svgObject.addEventListener("error", (error) => {
    if (requestSequence !== loadSequence || !svgObject.isConnected) return;
    statusText.textContent = `Unable to display ${pony.name}.`;
    console.error(error);
  }, { once: true });

  ponyFrame.replaceChildren(svgObject);
}

function updateActiveButton() {
  [...menu.children].forEach((button, index) => {
    button.classList.toggle("active", ponies[index] === activePony);
  });
}

function addSvgInteractions(svgObject) {
  if (!svgObject) return;

  // Same-origin local/GitHub Pages SVGs expose their document here. If an SVG
  // is served cross-origin, its own internal interaction scripts still work.
  let svgDocument;
  try {
    svgDocument = svgObject.contentDocument;
  } catch (error) {
    return;
  }

  const svg = svgDocument?.documentElement;
  if (!svg) return;

  // These hooks are optional: missing IDs simply result in no interaction.
  const eyes = [svg.querySelector("#eye"), svg.querySelector("#left-eye"), svg.querySelector("#right-eye")]
    .filter(Boolean);
  const nose = svg.querySelector("#nose");

  if (eyes.length) {
    svg.addEventListener("mousemove", (event) => {
      const bounds = svg.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 5;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 5;
      eyes.forEach((eye) => {
        eye.style.transformBox = "fill-box";
        eye.style.transformOrigin = "center";
        eye.style.transform = `translate(${x}px, ${y}px)`;
      });
    });

    svg.addEventListener("mouseleave", () => {
      eyes.forEach((eye) => { eye.style.transform = "translate(0, 0)"; });
    });
  }

  if (nose) {
    nose.style.cursor = "pointer";
    nose.addEventListener("click", () => {
      svg.classList.remove("boop");
      void svg.getBoundingClientRect();
      svg.classList.add("boop");
    });
  }
}

menuButton.addEventListener("click", () => {
  setMenuOpen(!menu.classList.contains("open"));
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".pony-picker")) setMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenuOpen(false);
    menuButton.focus();
  }
});

async function initializeGallery() {
  try {
    ponies = await getPonyFiles();
    if (!ponies.length) throw new Error("No SVG files were found in the pony directory");

    buildPonyMenu();
    await showPony(ponies[0]);
  } catch (error) {
    statusText.textContent = "No ponies could be loaded. Check the repository configuration.";
    console.error(error);
  }
}

initializeGallery();
