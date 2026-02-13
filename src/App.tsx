import { useState, useMemo } from 'react';
import { Header } from './components/Header';
import { YamlEditor } from './components/YamlEditor';
import { MermaidPreview } from './components/MermaidPreview';
import { MermaidCode } from './components/MermaidCode';
import { convertYamlToMermaid } from './lib/yaml-to-mermaid';
import { sampleWorkflows } from './lib/sample-workflows';

function App() {
  const [yamlInput, setYamlInput] = useState(sampleWorkflows[0].yaml);

  const { mermaidCode, error } = useMemo(
    () => convertYamlToMermaid(yamlInput),
    [yamlInput]
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header />
      <main className="flex-1 flex min-h-0">
        {/* 左パネル: YAML 入力 */}
        <div className="w-1/2 border-r border-gray-200 flex flex-col min-h-0">
          <YamlEditor value={yamlInput} onChange={setYamlInput} />
        </div>

        {/* 右パネル: プレビュー + コード */}
        <div className="w-1/2 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-hidden">
            <MermaidPreview code={mermaidCode} error={error} />
          </div>
          <MermaidCode code={mermaidCode} />
        </div>
      </main>
    </div>
  );
}

export default App;
