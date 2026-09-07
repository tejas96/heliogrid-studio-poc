/**
 * Architecture rules for the studio.
 *
 * The layer order this repo actually wants, bottom to top:
 *
 *   data  <  lib  <  store  <  components  <  three  <  screens  <  app
 *
 * `data/` is reference tables and rules; it imports nothing of ours.
 * `lib/` is pure engineering logic — it must stay callable from a test,
 * a worker or a server route without dragging React or three.js in.
 * Everything above may reach down. Nothing may reach up.
 *
 * Every rule below is an `error` and the tree passes all of them, so
 * `npm run cycles` belongs in the pre-commit gate next to tsc and the
 * suite. Do NOT downgrade a rule to let a new import through — move the
 * code, or the layering stops meaning anything.
 */

const STUDIO = '^src/features/solar-studio';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'A cycle means neither module can be understood, tested or deleted on its own.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment:
        'Nothing imports this file and it is not an entry point. It is a deletion candidate.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|tsx|json)$',
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(babel|webpack|postcss|next|vitest)\\.config\\.(js|cjs|mjs|ts)$',
          '^src/app/',
          '__tests__',
          '\\.test\\.(ts|tsx)$',
        ],
      },
      to: {},
    },
    {
      name: 'no-unresolvable',
      comment: 'An import that does not resolve. Almost always a stale path.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'lib-stays-pure',
      comment:
        'Pure logic must not reach up into UI, 3D, the store or workers. The ' +
        'one exception is lib/analysis-client.ts: it IS the main-thread half of ' +
        'the analysis worker, so it must name the worker file to spawn it and ' +
        'must import the response type the worker sends back.',
      severity: 'error',
      from: {
        path: `${STUDIO}/lib/`,
        pathNot: ['__tests__', '\\.test\\.(ts|tsx)$', `${STUDIO}/lib/analysis-client\\.ts$`],
      },
      to: { path: `${STUDIO}/(screens|components|three|store|workers)/` },
    },
    {
      name: 'components-below-screens',
      comment: 'A shared component must not import a screen.',
      severity: 'error',
      from: { path: `${STUDIO}/components/`, pathNot: ['__tests__', '\\.test\\.(ts|tsx)$'] },
      to: { path: `${STUDIO}/screens/` },
    },
    {
      name: 'data-is-a-leaf',
      comment: 'Reference data must not depend on any code layer.',
      severity: 'error',
      from: { path: `${STUDIO}/data/` },
      to: { path: `${STUDIO}/(lib|store|components|three|screens|workers)/` },
    },
    {
      name: 'store-below-ui',
      comment: 'The store must not import UI, 3D or screens.',
      severity: 'error',
      from: { path: `${STUDIO}/store/`, pathNot: ['__tests__', '\\.test\\.(ts|tsx)$'] },
      to: { path: `${STUDIO}/(screens|components|three)/` },
    },
    {
      name: 'no-test-code-in-src',
      comment: 'Shipping code must never import a test file or a test helper.',
      severity: 'error',
      from: { pathNot: ['__tests__', '\\.test\\.(ts|tsx)$'] },
      to: { path: ['__tests__', '\\.test\\.(ts|tsx)$'] },
    },
    {
      name: 'not-to-dev-dep',
      comment: 'Shipping code importing a devDependency breaks the production build.',
      severity: 'error',
      from: { path: '^src/', pathNot: ['__tests__', '\\.test\\.(ts|tsx)$', '\\.config\\.'] },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(node_modules|\\.next|public)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)' },
      archi: {
        collapsePattern:
          '^(src/features/solar-studio/[^/]+|src/app/[^/]+|src/design|node_modules/(@[^/]+/[^/]+|[^/]+))',
      },
    },
  },
};
