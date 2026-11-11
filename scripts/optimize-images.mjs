import sharp from "sharp";
import { readFile, writeFile, readdir } from "node:fs/promises";
for (const name of ["hero", "campaigns", "feature", "products"])
  await sharp(`public/images/${name}.png`)
    .webp({ quality: 88 })
    .toFile(`public/images/${name}.webp`);
for (const name of await readdir("src")) {
  if (!/\.(tsx?|css)$/.test(name)) continue;
  const path = "src/" + name;
  const content = await readFile(path, "utf8");
  await writeFile(
    path,
    content.replace(
      /\/images\/(hero|campaigns|feature|products)\.png/g,
      "/images/$1.webp",
    ),
  );
}
