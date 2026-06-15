// Generates examples/large-pipeline.asl.json: a 50+ state JSONata machine that
// chains variables across many steps and includes a Parallel and a Map, to
// stress-test the viewer (navigation, variable highlighting, scope boxes) and
// help decide whether a search/finder is needed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const states = {};
const pad = (n) => String(n).padStart(2, '0');
const stepName = (n) => `Step${pad(n)}`;
const varName = (n) => `s${pad(n)}`;

const TOTAL = 45; // linear slots; two of them become containers
const PARALLEL_AT = 15;
const MAP_AT = 30;

function taskBody(n, next) {
  const prev = n > 1 ? `$${varName(n - 1)}` : '$states.input.seed';
  return {
    Type: 'Task',
    Resource: 'arn:aws:states:::lambda:invoke',
    Arguments: {
      FunctionName: `stage${pad(n)}Fn`,
      Payload: `{% { 'prev': ${prev}, 'n': ${n} } %}`,
    },
    Assign: {
      [varName(n)]: `{% $states.result.Payload.value %}`,
    },
    ...next,
  };
}

for (let n = 1; n <= TOTAL; n++) {
  const next = n < TOTAL ? { Next: stepName(n + 1) } : { Next: 'Aggregate' };

  if (n === PARALLEL_AT) {
    states[stepName(n)] = {
      Type: 'Parallel',
      Branches: [0, 1, 2].map((b) => ({
        StartAt: `P${pad(n)}_B${b}_A`,
        States: {
          [`P${pad(n)}_B${b}_A`]: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Arguments: { FunctionName: `branch${b}Fetch`, Payload: `{% { 'prev': $${varName(n - 1)} } %}` },
            Assign: { [`branch${b}Raw`]: '{% $states.result.Payload %}' },
            Next: `P${pad(n)}_B${b}_B`,
          },
          [`P${pad(n)}_B${b}_B`]: {
            Type: 'Pass',
            Output: `{% { 'branch': ${b}, 'data': $branch${b}Raw } %}`,
            End: true,
          },
        },
      })),
      Assign: { [varName(n)]: '{% $states.result %}' },
      ...next,
    };
    continue;
  }

  if (n === MAP_AT) {
    states[stepName(n)] = {
      Type: 'Map',
      Items: `{% $${varName(n - 1)}.records %}`,
      ItemProcessor: {
        StartAt: `M${pad(n)}_Validate`,
        States: {
          [`M${pad(n)}_Validate`]: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Arguments: { FunctionName: 'validateRecord', Payload: '{% $states.context.Map.Item.Value %}' },
            Assign: { recordStatus: '{% $states.result.Payload.status %}' },
            Next: `M${pad(n)}_Enrich`,
          },
          [`M${pad(n)}_Enrich`]: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Arguments: { FunctionName: 'enrichRecord', Payload: `{% { 'status': $recordStatus } %}` },
            Assign: { enriched: '{% $states.result.Payload %}' },
            Next: `M${pad(n)}_Emit`,
          },
          [`M${pad(n)}_Emit`]: {
            Type: 'Pass',
            Output: `{% { 'status': $recordStatus, 'record': $enriched } %}`,
            End: true,
          },
        },
      },
      Assign: { [varName(n)]: '{% $states.result %}' },
      ...next,
    };
    continue;
  }

  states[stepName(n)] = taskBody(n, next);
}

// Final aggregation uses several of the chained variables, then a Choice + ends.
states['Aggregate'] = {
  Type: 'Task',
  Resource: 'arn:aws:states:::lambda:invoke',
  Arguments: {
    FunctionName: 'aggregate',
    Payload: `{% { 'parallel': $${varName(PARALLEL_AT)}, 'mapped': $${varName(MAP_AT)}, 'last': $${varName(TOTAL)} } %}`,
  },
  Assign: { report: '{% $states.result.Payload.report %}' },
  Next: 'QualityGate',
};
states['QualityGate'] = {
  Type: 'Choice',
  Choices: [{ Condition: '{% $report.ok = true %}', Next: 'Succeeded' }],
  Default: 'Failed',
};
states['Succeeded'] = { Type: 'Succeed' };
states['Failed'] = { Type: 'Fail', Error: 'QualityCheckFailed', Cause: 'Report not ok' };

const machine = {
  Comment: 'Large (50+ state) JSONata pipeline for stress-testing the viewer.',
  QueryLanguage: 'JSONata',
  StartAt: 'Step01',
  States: states,
};

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../examples/large-pipeline.asl.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(machine, null, 2) + '\n');

// Rough state count for the log.
let count = 0;
const walk = (sm) => {
  for (const s of Object.values(sm.States)) {
    count++;
    if (s.Branches) s.Branches.forEach(walk);
    if (s.ItemProcessor) walk(s.ItemProcessor);
  }
};
walk(machine);
console.log(`Wrote ${out} with ${count} states.`);
