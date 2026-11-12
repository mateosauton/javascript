import { spawnSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const packageDir = resolve(import.meta.dirname, '..');
const fixtureDir = resolve(packageDir, 'test/rsc');
const packageJson = JSON.parse(await readFile(resolve(packageDir, 'package.json'), 'utf8'));

const isNamespace = value => value !== null && typeof value === 'object' && !('$$typeof' in value);
const isComponent = (name, value) =>
  /^[A-Z]/.test(name) &&
  (typeof value === 'function' ||
    (value !== null && typeof value === 'object' && value.$$typeof !== Symbol.for('react.context')));

const entries = await Promise.all(
  Object.entries(packageJson.exports)
    .filter(([subpath]) => subpath.startsWith('./components/'))
    .map(async ([subpath, target], index) => {
      const module = await import(resolve(packageDir, target.import));
      return { specifier: `@clerk/mosaic${subpath.slice(1)}`, alias: `entry${index}`, module };
    }),
);

const references = [];
const elements = [];
for (const { specifier, alias, module } of entries) {
  for (const [name, value] of Object.entries(module)) {
    if (isNamespace(value)) {
      for (const part of Object.keys(value)) {
        references.push(`  ['${specifier}', '${name}.${part}', ${alias}.${name}.${part}],`);
        if (isComponent(part, value[part])) elements.push(`      <${alias}.${name}.${part} />`);
      }
    } else {
      references.push(`  ['${specifier}', '${name}', ${alias}.${name}],`);
      if (isComponent(name, value)) elements.push(`      <${alias}.${name} />`);
    }
  }
}

const page = `import { Unrendered } from './unrendered';
${entries.map(({ specifier, alias }) => `import * as ${alias} from '${specifier}';`).join('\n')}

const references = [
${references.join('\n')}
];

export default function Page() {
  const missing = references.filter(([, , value]) => value === undefined).map(([specifier, name]) => \`\${specifier}: \${name}\`);
  if (missing.length > 0) {
    throw new Error(\`Undefined in a Server Component:\\n\${missing.join('\\n')}\`);
  }
  return (
    <Unrendered>
${elements.join('\n')}
    </Unrendered>
  );
}
`;

await writeFile(resolve(fixtureDir, 'app/page.jsx'), page);
await rm(resolve(fixtureDir, '.next'), { recursive: true, force: true });

const bundlerFlag = process.argv.includes('--webpack') ? ['--webpack'] : [];
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
const { status, error } = spawnSync(process.execPath, [nextBin, 'build', ...bundlerFlag, fixtureDir], {
  cwd: packageDir,
  stdio: 'inherit',
});
if (error) throw error;
process.exit(status ?? 1);
