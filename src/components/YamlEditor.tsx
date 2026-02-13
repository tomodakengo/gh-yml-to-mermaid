import { sampleWorkflows } from '../lib/sample-workflows';

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function YamlEditor({ value, onChange }: YamlEditorProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">
          YAML Input
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor="sample-select" className="text-xs text-gray-500">
            Sample:
          </label>
          <select
            id="sample-select"
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            defaultValue=""
            onChange={(e) => {
              const idx = Number(e.target.value);
              if (!isNaN(idx) && sampleWorkflows[idx]) {
                onChange(sampleWorkflows[idx].yaml);
              }
            }}
          >
            <option value="" disabled>
              Select a sample
            </option>
            {sampleWorkflows.map((sample, i) => (
              <option key={i} value={i}>
                {sample.name} — {sample.description}
              </option>
            ))}
          </select>
        </div>
      </div>
      <textarea
        className="flex-1 w-full p-4 font-mono text-sm bg-white text-gray-900 resize-none focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`name: CI\non:\n  push:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Build\n        run: npm run build`}
        spellCheck={false}
      />
    </div>
  );
}
