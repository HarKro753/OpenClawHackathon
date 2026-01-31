const server = Bun.serve({
  port: 3001,
  fetch(req) {
    const url = new URL(req.url);

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({ status: "ok", message: "Backend is running!" }),
        { headers },
      );
    }

    if (url.pathname === "/api/hello") {
      return new Response(
        JSON.stringify({ message: "Hello from Bun backend!" }),
        { headers },
      );
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers,
    });
  },
});

console.log(`Backend server running at http://localhost:${server.port}`);
