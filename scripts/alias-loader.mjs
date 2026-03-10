import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    let mapped = path.resolve(process.cwd(), specifier.slice(2));
    if (!path.extname(mapped)) {
      if (fs.existsSync(`${mapped}.js`)) {
        mapped = `${mapped}.js`;
      } else if (fs.existsSync(path.join(mapped, 'index.js'))) {
        mapped = path.join(mapped, 'index.js');
      }
    }
    return nextResolve(pathToFileURL(mapped).href, context);
  }
  return nextResolve(specifier, context);
}
