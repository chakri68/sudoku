import "./styles/main.css";
import { App } from "./app/app.ts";

const mount = document.querySelector<HTMLElement>("#app");
if (!mount) throw new Error("Missing #app mount point");

new App(mount).start();
