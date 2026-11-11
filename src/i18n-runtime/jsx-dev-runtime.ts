import { jsxDEV as original } from "react/jsx-dev-runtime";
import { translateProps } from "./jsx-runtime";
export { Fragment } from "react/jsx-dev-runtime";
export type { JSX } from "react/jsx-dev-runtime";
export const jsxDEV: typeof original = (
  type,
  props,
  key,
  isStatic,
  source,
  self,
) => original(type, translateProps(type, props), key, isStatic, source, self);
