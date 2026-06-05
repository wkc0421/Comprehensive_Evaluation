import { createServer } from "node:http";

import { handleRequest } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Internal server error" }));
  });
});

server.listen(port, host, () => {
  console.log(`广东综评服务已启动：http://${host}:${port}`);
});
