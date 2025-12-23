'use client';

interface SequenceStep {
  delay_days: number;
  subject: string;
  content: string;
}

interface SequenceStepEditorProps {
  steps: SequenceStep[];
  onChange: (steps: SequenceStep[]) => void;
}

export function SequenceStepEditor({ steps, onChange }: SequenceStepEditorProps) {
  const addStep = () => {
    onChange([...steps, { delay_days: 0, subject: '', content: '' }]);
  };

  const removeStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index);
    onChange(newSteps);
  };

  const updateStep = (index: number, field: keyof SequenceStep, value: string | number) => {
    const newSteps = [...steps];
    newSteps[index] = {
      ...newSteps[index],
      [field]: value,
    };
    onChange(newSteps);
  };

  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <div
          key={index}
          className="bg-white border border-[#e5e5e5] rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-[#1e1e1e]">
              ステップ {index + 1}
            </h4>
            <button
              type="button"
              onClick={() => removeStep(index)}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              削除
            </button>
          </div>

          <div>
            <label
              htmlFor={`delay_days_${index}`}
              className="block text-sm font-medium text-[#525252] mb-1"
            >
              送信までの日数 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id={`delay_days_${index}`}
              value={step.delay_days}
              onChange={(e) => updateStep(index, 'delay_days', parseInt(e.target.value) || 0)}
              min="0"
              placeholder="0"
              className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent transition-all"
              required
            />
            <p className="text-xs text-[#a3a3a3] mt-1">
              購読登録後、何日後に送信するか（0 = 即時送信）
            </p>
          </div>

          <div>
            <label
              htmlFor={`subject_${index}`}
              className="block text-sm font-medium text-[#525252] mb-1"
            >
              件名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id={`subject_${index}`}
              value={step.subject}
              onChange={(e) => updateStep(index, 'subject', e.target.value)}
              placeholder="メールの件名を入力"
              className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent transition-all"
              required
            />
          </div>

          <div>
            <label
              htmlFor={`content_${index}`}
              className="block text-sm font-medium text-[#525252] mb-1"
            >
              本文 <span className="text-red-500">*</span>
            </label>
            <textarea
              id={`content_${index}`}
              value={step.content}
              onChange={(e) => updateStep(index, 'content', e.target.value)}
              placeholder="メール本文を入力"
              rows={6}
              className="w-full px-3 py-2 border border-[#e5e5e5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent transition-all font-mono text-sm"
              required
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addStep}
        className="w-full py-3 border-2 border-dashed border-[#e5e5e5] text-[#525252] rounded-lg hover:border-[#7c3aed] hover:text-[#7c3aed] transition-colors"
      >
        + ステップを追加
      </button>
    </div>
  );
}
