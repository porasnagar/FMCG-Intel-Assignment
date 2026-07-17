export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  const routePath = Array.isArray(params.route) ? params.route.join('/') : params.route;
  const backendUrl = env.BACKEND_URL; 
  
  if (!backendUrl) {
    return new Response(JSON.stringify({ error: "BACKEND_URL is not configured in Cloudflare Pages environment variables" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const url = new URL(request.url);
  const targetUrl = new URL(`/api/${routePath}${url.search}`, backendUrl);
  const modifiedRequest = new Request(targetUrl.toString(), request);
  
  // If the Hugging Face Space is private, inject the HF_TOKEN
  if (env.HF_TOKEN) {
    modifiedRequest.headers.set("Authorization", `Bearer ${env.HF_TOKEN}`);
  }

  try {
    const response = await fetch(modifiedRequest);
    return response;
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to proxy request to backend", details: String(error) }), { 
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
};

interface Env {
  BACKEND_URL: string;
  HF_TOKEN: string;
}
