export interface Env {
  GITHUB_TOKEN: string
}

export default {
  async fetch(
    request,
    env,
    ctx,
  ): Promise<Response> {
    const url = new URL(request.url);
    return new Response(`Hello ${url.searchParams.get("name") || "World"}!`);
  },
} satisfies ExportedHandler<Env>;
