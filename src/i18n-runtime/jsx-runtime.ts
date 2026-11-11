import { jsx as reactJsx, jsxs as reactJsxs } from "react/jsx-runtime";
import { t, localPath } from "../i18n";
export { Fragment } from "react/jsx-runtime";
export type { JSX } from "react/jsx-runtime";
function text(value: unknown): unknown {
  if (typeof value === "string") return t(value);
  if (Array.isArray(value)) return value.map(text);
  return value;
}
export function translateProps(type: unknown, props: any) {
  if (
    typeof type !== "string" ||
    !props ||
    ["script", "style", "code", "pre"].includes(type)
  )
    return props;
  const translated = { ...props, children: text(props.children) };
  for (const key of ["aria-label", "title", "alt", "placeholder"])
    if (typeof props[key] === "string") translated[key] = t(props[key]);
  if (type === "textarea" && typeof props.defaultValue === "string")
    translated.defaultValue = t(props.defaultValue);
  if (
    type === "a" &&
    typeof props.href === "string" &&
    props.href.startsWith("/") &&
    !props.href.startsWith("/api/") &&
    !props.download
  )
    translated.href = localPath(props.href);
  return translated;
}
// Central translation of host-element copy keeps legacy and MDX screens on the same
// dictionary. Data attributes, form values, IDs, routes and component props are untouched.
export const jsx: typeof reactJsx = (type, props, key) =>
  reactJsx(type, translateProps(type, props), key);
export const jsxs: typeof reactJsxs = (type, props, key) =>
  reactJsxs(type, translateProps(type, props), key);
