interface UploadPanelProps {
  fileName: string;
  disabled: boolean;
  onFileChange: (file: File | null) => void;
}

export default function UploadPanel({
  fileName,
  disabled,
  onFileChange,
}: UploadPanelProps) {
  return (
    <section className="demo-panel muted-panel">
      <div className="field-group">
        <label htmlFor="sheet-upload">答题卡图片</label>
        <input
          id="sheet-upload"
          type="file"
          accept="image/*,.jpg,.jpeg,.png"
          disabled={disabled}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        <p className="helper-text">
          建议竖版拍摄，完整拍到题号区域；若未上传图片，也可先走示例结果流程。
        </p>
        <p className="helper-text">
          当前适合固定版式题单、答题卡，不适合自由排版作业本。
        </p>
        <div className="asset-links">
          <a href="/test-sheets/scheme-b-filled.png" download="scheme-b-filled.png">
            下载演示答题卡图片
          </a>
          <a href="/test-sheets/scheme-b-clean.svg" target="_blank" rel="noreferrer">
            查看标准答题卡
          </a>
          <a href="/test-sheets/scheme-b-fraction.svg" target="_blank" rel="noreferrer">
            查看分数填空样例
          </a>
        </div>
        {fileName ? <p className="upload-name">当前已选择：{fileName}</p> : null}
      </div>
    </section>
  );
}
