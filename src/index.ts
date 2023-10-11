export interface Env {}

export default {
  async fetch(
    request,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/view-source") {
      return Response.redirect("https://github.com/luxass/assets", 301);
    }
    if (url.pathname === "/") {
      url.pathname = "/README.md";
    }
    const branch = url.searchParams.get("branch") || "main";
    return fetch(`https://raw.githubusercontent.com/luxass/assets/${branch}/${url.pathname}`);
  },
} satisfies ExportedHandler<Env>;
