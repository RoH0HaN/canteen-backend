import dotenv from "dotenv";
import { App } from "./app.js";

dotenv.config({
  path: "./.env",
});

const PORT = Number(process.env.PORT) || 3000;

const app = new App();

app.startServer(PORT);
