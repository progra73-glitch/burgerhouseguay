
function json(data, status = 200) {
  return Response.json(data, { status });
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return b64url(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(value)
  ));
}

async function validToken(request, secret) {
  const token = request.headers.get("Authorization") || "";
  const parts = token.replace("Bearer ", "").split(".");
  if (parts.length !== 2) return false;

  const expected = await sign(parts[0], secret);
  if (expected !== parts[1]) return false;

  try {
    const payload = JSON.parse(atob(
      parts[0].replace(/-/g, "+").replace(/_/g, "/")
    ));
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/products" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM products ORDER BY sort_order, id"
        ).all();
        return json({ products: results });
      } catch {
        return json({ error: "Error al consultar productos" }, 500);
      }
    }

    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      if (!env.ADMIN_PASSWORD) {
        return json({ error: "Falta configurar la contraseña" }, 500);
      }

      const body = await request.json();
      if (body.password !== env.ADMIN_PASSWORD) {
        return json({ error: "Contraseña incorrecta" }, 401);
      }

      const payload = b64url(new TextEncoder().encode(
        JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })
      ));

      return json({ token: payload + "." + await sign(payload, env.ADMIN_PASSWORD) });
    }

    if (url.pathname.startsWith("/api/admin/")) {
      if (!env.ADMIN_PASSWORD ||
          !(await validToken(request, env.ADMIN_PASSWORD))) {
        return json({ error: "No autorizado" }, 401);
      }

      const match = url.pathname.match(/^\/api\/admin\/products\/(\d+)$/);

      if (match && request.method === "PUT") {
        const id = Number(match[1]);
        const p = await request.json();

        try {
          await env.DB.prepare(
            `UPDATE products SET
              name = ?, description = ?, category = ?,
              price = ?, image_url = ?, available = ?
             WHERE id = ?`
          ).bind(
            p.name, p.description || "", p.category,
            Number(p.price), p.image_url || "",
            p.available ? 1 : 0, id
          ).run();

          return json({ success: true });
        } catch {
          return json({ error: "No se pudo guardar el producto" }, 500);
        }
      }

      return json({ error: "Ruta no encontrada" }, 404);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Ruta no encontrada" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
