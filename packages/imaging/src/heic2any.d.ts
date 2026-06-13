// Optional runtime peer — only dynamically imported in the browser when a HEIC file is
// uploaded. Declared loosely so the package type-checks without the dependency present.
declare module "heic2any" {
  const heic2any: (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>;
  export default heic2any;
}
