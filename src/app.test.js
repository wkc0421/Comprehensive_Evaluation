import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { handleRequest } from "./app.js";

describe("web routes", () => {
  let baseUrl;
  let server;

  before(async () => {
    server = createServer((request, response) => {
      handleRequest(request, response).catch((error) => {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: error.message }));
      });
    });

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("renders the student home route", async () => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Mobile-first student web app/);
    assert.match(body, /Grade-aware entry points/);
  });

  it("renders the admin placeholder route", async () => {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Admin console placeholder/);
    assert.match(body, /Official guide review/);
  });

  it("returns the health API contract", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.database, "postgresql");
  });
});
