module.exports = (path, options) => {
  // Call the defaultResolver, so we leverage its cache, error handling, etc.
  return options.defaultResolver(path, {
    ...options,
    // Use packageFilter to process parsed `package.json` before the resolution
    // (see https://www.npmjs.com/package/resolve#resolveid-opts-cb)
    packageFilter: (pkg, name) => {
      if (name.endsWith('cli-testing-library'))
        pkg.type = 'module';
      return pkg;
    }
  });
};