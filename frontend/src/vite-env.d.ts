/// <reference types="vite/client" />

declare module '*.module.less' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

