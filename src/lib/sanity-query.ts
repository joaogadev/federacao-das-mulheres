// Only published content, even if a future caller accidentally adds credentials.
export const apiVersion = '2025-02-19';
const published =
  '!(_id in path("drafts.**")) && !(_id in path("versions.**"))';
const article = `_id, title, "slug": slug.current, description, body,
  "image": select(defined(image.asset) => {"url": image.asset->url, "alt": image.alt})`;
export const contentQuery = `{
  "site": *[_type == "institucional" && _id == "institucional" && ${published}][0]{
    _id, name, tagline, intro, homeMessage, history, mission, vision, values,
    email, phone, address, instagram, facebook, donationUrl
  },
  "noticias": *[_type == "noticia" && ${published}] | order(date desc, _id asc){${article}, date},
  "eventos": *[_type == "evento" && ${published}] | order(date asc, _id asc){${article}, date, time, location},
  "projetos": *[_type == "projeto" && ${published}] | order(title asc, _id asc){${article}},
  "depoimentos": *[_type == "depoimento" && ${published}] | order(name asc, _id asc){_id, name, role, body}
}`;
