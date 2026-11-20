import { lazy, Suspense, useId, useState } from 'react';
import { Button, Input, Select, Slider } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { defaultSpeed, frameAt, MODES, secondsAt } from './cue-sheet.js';

const MODE_OPTIONS = Object.entries(MODES).map(([value, label]) => ({ value, label }));
const COLORS = [{ label: '常用颜色', colors: ['#67E6B1', '#6BA7FC', '#CE8AFF', '#FFAD66', '#F27BA6', '#FFF1A3', '#FFFFFF', '#000000'] }];
const ColorPicker = lazy(() => import('antd/es/color-picker/index.js'));

export function CommitField({ value, onCommit, label, ...props }) {
  const id = useId();
  const [draft, setDraft] = useState(null);
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <Input
        {...props}
        id={id}
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null) onCommit(draft);
          setDraft(null);
        }}
        onPressEnter={(event) => event.currentTarget.blur()}
      />
    </div>
  );
}

export function numericValue(raw) {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value)) throw new Error('请输入有效的数字。');
  return value;
}

const displaySeconds = (frames, fps) => Number(secondsAt(frames, fps).toFixed(3));

function ColorField({ label, value, onChange }) {
  const [draft, setDraft] = useState(null);
  return (
    <div className="field">
      <span>{label}</span>
      <Suspense fallback={<Button block disabled>读取颜色控件…</Button>}>
        <ColorPicker
          value={draft ?? value}
          presets={COLORS}
          disabledAlpha
          disabledFormat
          format="hex"
          onChange={(color) => setDraft(color.toHexString().toUpperCase())}
          onOpenChange={(open) => {
            if (!open && draft !== null) {
              onChange(draft);
              setDraft(null);
            }
          }}
          onChangeComplete={(color) => {
            onChange(color.toHexString().toUpperCase());
            setDraft(null);
          }}
        >
          <Button block className="color-trigger" aria-label={label}>
            <span className="color-swatch" style={{ backgroundColor: draft ?? value }} aria-hidden="true" />
            <span>{draft ?? value}</span>
          </Button>
        </ColorPicker>
      </Suspense>
    </div>
  );
}

function BrightnessField({ brightness, onChange }) {
  const [draft, setDraft] = useState(null);
  const value = draft ?? brightness;
  return (
    <div className="field brightness-field">
      <span>亮度 <b>{value}%</b></span>
      <Slider
        aria-label="亮度"
        value={value}
        tooltip={{ open: false }}
        onChange={setDraft}
        onChangeComplete={(next) => { onChange(next); setDraft(null); }}
      />
    </div>
  );
}

function CueFields({ cue, sheet, run, onUpdate }) {
  function commitTime(key, raw) {
    run(() => onUpdate({ [key]: frameAt(numericValue(raw), sheet.fps) }));
  }

  return (
    <div className="inspector-fields">
      <div className="fields-pair">
        <CommitField label="开始（秒）" type="number" step="0.001" min="0" value={displaySeconds(cue.start_frame, sheet.fps)} onCommit={(raw) => commitTime('start_frame', raw)} />
        <CommitField label="结束（秒）" type="number" step="0.001" min="0" value={displaySeconds(cue.end_frame, sheet.fps)} onCommit={(raw) => commitTime('end_frame', raw)} />
      </div>
      <div className="field">
        <span>效果</span>
        <Select
          aria-label="灯效类型"
          value={cue.mode}
          options={MODE_OPTIONS}
          virtual={false}
          onChange={(mode) => onUpdate({ mode, end_color: mode === 'gradient' ? '#CE8AFF' : null, speed: null })}
        />
      </div>
      {cue.mode !== 'off' && (
        <div className="fields-pair">
          <ColorField label={cue.mode === 'gradient' ? '起始颜色' : '颜色'} value={cue.color} onChange={(color) => onUpdate({ color })} />
          {cue.mode === 'gradient'
            ? <ColorField label="结束颜色" value={cue.end_color} onChange={(end_color) => onUpdate({ end_color })} />
            : defaultSpeed(cue.mode) !== null && (
              <CommitField label="速度参数" type="number" step="1" min="1" max="255" value={cue.speed ?? defaultSpeed(cue.mode)} onCommit={(raw) => run(() => onUpdate({ speed: numericValue(raw) }))} />
            )}
        </div>
      )}
      {cue.mode !== 'off' && <BrightnessField brightness={cue.brightness} onChange={(brightness) => onUpdate({ brightness })} />}
    </div>
  );
}

export default function Inspector({ cue, sheet, run, onUpdate, onRemove, onResize, onExample }) {
  return (
    <section className="panel inspector" aria-label="灯效属性">
      <div className="panel-heading">
        <h2>{cue ? '灯效属性' : '工程设置'}</h2>
        {cue && <Button type="text" danger icon={<DeleteOutlined />} onClick={onRemove} aria-label="删除灯效" title="删除灯效" />}
      </div>
      {cue ? <CueFields key={cue.id} cue={cue} sheet={sheet} run={run} onUpdate={onUpdate} /> : (
        <div className="inspector-fields project-inspector">
          <CommitField label="总时长（秒）" type="number" step="0.001" min="0" value={displaySeconds(sheet.duration_frames, sheet.fps)} onCommit={(raw) => run(() => onResize(numericValue(raw)))} />
          <p>{sheet.cues.length ? '选中时间轴上的灯效块，就能修改时间、颜色和效果。' : '先选一段音频或视频，再到时间轴上添加灯效。也可以直接试用示例。'}</p>
          {!sheet.cues.length && <Button onClick={onExample}>试用示例</Button>}
        </div>
      )}
    </section>
  );
}
