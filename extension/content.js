function readCraigslistListing() {
  // Shared links leave the category out of the URL. Read it from the breadcrumb.
  if (location.pathname.startsWith("/view/d/")) {
    const categoryLink = document.querySelector(".breadcrumbs .category a");
    if (!categoryLink) return null;

    const category = new URL(categoryLink.href).searchParams.get("cat");
    if (category !== "cta" && category !== "cto" && category !== "ctd") return null;
  }

  const text = (selector) => document.querySelector(selector)?.innerText.trim();
  const title = text("#titletextonly");
  const description = text("#postingbody");
  if (!title && !description) return null;

  const details = [];
  const price = text(".postingtitletext .price");
  if (title) details.push(title);
  if (price) details.push("Price: " + price);

  const specs = document.querySelectorAll(".attrgroup .attr, p.attrgroup > span");
  for (const spec of specs) {
    const line = spec.innerText.trim().replace(/\s+/g, " ");
    if (line) details.push(line);
  }

  const postId = text(".postinginfos")?.match(/\bpost id:\s*(\d+)/i)?.[1];
  if (postId) details.push("Post ID: " + postId);

  return { details, description };
}
