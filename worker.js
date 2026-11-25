
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/products" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM products ORDER BY sort_order, id"
        ).all();

        return Response.json({ products: results });
      } catch (error) {
        return Response.json(
          { error: "Error al consultar productos" },
          { status: 500 }
        );
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "Ruta no encontrada" },
        { status: 404 }
      );
    }

    return env.ASSETS.fetch(request);
  }
};

