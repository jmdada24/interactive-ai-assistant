const fs = require('node:fs');

const reportPath = process.argv[2];

if (!reportPath) {
  console.error('Usage: node scripts/print-qwen-eval-report.js REPORT.json');
  process.exit(1);
}

let report;

try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`Could not read evaluation report: ${error.message}`);
  process.exit(1);
}

if (report.status !== 'complete') {
  console.error(`Evaluation failed: ${report.error ?? 'Unknown error'}`);
  process.exit(1);
}

const metrics = report.metrics;

console.log('Qwen evaluation results');
console.log(`Grounded-Answer Rate:      ${formatPercent(metrics.groundedAnswerRatePercent)} ↑`);
console.log(`Safe-Refusal Rate:         ${formatPercent(metrics.safeRefusalRatePercent)} ↑`);
console.log(`Median End-to-End Time:    ${formatSeconds(metrics.medianEndToEndSeconds)} ↓`);
console.log(`Model:                     ${report.model.llm}`);
console.log(`Cases:                     ${report.counts.totalCases}`);

if (report.counts.operationalFailures > 0) {
  console.log(`Operational failures:      ${report.counts.operationalFailures}`);
}

const failedCases = report.results.filter((result) => !result.passed);

if (failedCases.length > 0) {
  console.log('\nCases needing review');

  for (const result of failedCases) {
    console.log(`- ${result.id}: ${result.scoreExplanation}`);
  }
}

if (report.warnings?.length) {
  console.log('\nWarnings');

  for (const warning of report.warnings) {
    console.log(`- ${warning}`);
  }
}

function formatPercent(value) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : 'n/a';
}

function formatSeconds(value) {
  return typeof value === 'number' ? `${value.toFixed(3)} s` : 'n/a';
}
