import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // El editor y la lista de proyectos son privados de cada usuario: no indexar.
    rules: { userAgent: "*", allow: "/", disallow: ["/editor/", "/projects"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
