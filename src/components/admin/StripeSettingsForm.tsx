'use client';

import { useState, useEffect } from 'react';
import {
  getStripeSettings,
  updateStripeSettings,
  type StripeSettings,
} from '../../utils/admin-api';

type StripeMode = 'test' | 'live';

interface KeyFieldState {
  value: string;
  editing: boolean;
  originalValue: string;
}

const EXPECTED_PREFIXES: Record<string, string[]> = {
  test_secret_key: ['sk_test_'],
  test_publishable_key: ['pk_test_'],
  live_secret_key: ['sk_live_', 'rk_live_'],
  live_publishable_key: ['pk_live_'],
  test_webhook_secret: ['whsec_'],
  live_webhook_secret: ['whsec_'],
};

function validatePrefix(field: string, value: string): boolean {
  const prefixes = EXPECTED_PREFIXES[field];
  if (!prefixes || !value || value.includes('****')) return true;
  return prefixes.some((p) => value.startsWith(p));
}

export function StripeSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<StripeMode>('live');
  const [usingEnvFallback, setUsingEnvFallback] = useState(false);

  const [keys, setKeys] = useState<Record<string, KeyFieldState>>({
    test_secret_key: { value: '', editing: false, originalValue: '' },
    test_publishable_key: { value: '', editing: false, originalValue: '' },
    live_secret_key: { value: '', editing: false, originalValue: '' },
    live_publishable_key: { value: '', editing: false, originalValue: '' },
    test_webhook_secret: { value: '', editing: false, originalValue: '' },
    live_webhook_secret: { value: '', editing: false, originalValue: '' },
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    setError(null);

    try {
      const res = await getStripeSettings();
      if (res.success && res.data) {
        const d = res.data;
        setMode(d.mode);
        setUsingEnvFallback(d.using_env_fallback);
        setKeys({
          test_secret_key: { value: d.test_secret_key, editing: false, originalValue: d.test_secret_key },
          test_publishable_key: { value: d.test_publishable_key, editing: false, originalValue: d.test_publishable_key },
          live_secret_key: { value: d.live_secret_key, editing: false, originalValue: d.live_secret_key },
          live_publishable_key: { value: d.live_publishable_key, editing: false, originalValue: d.live_publishable_key },
          test_webhook_secret: { value: d.test_webhook_secret || '', editing: false, originalValue: d.test_webhook_secret || '' },
          live_webhook_secret: { value: d.live_webhook_secret || '', editing: false, originalValue: d.live_webhook_secret || '' },
        });
      } else {
        setError(res.error || 'Failed to load Stripe settings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  function handleEditField(field: string) {
    setKeys((prev) => ({
      ...prev,
      [field]: { ...prev[field], value: '', editing: true },
    }));
  }

  function handleCancelEdit(field: string) {
    setKeys((prev) => ({
      ...prev,
      [field]: { ...prev[field], value: prev[field].originalValue, editing: false },
    }));
  }

  function handleKeyChange(field: string, value: string) {
    setKeys((prev) => ({
      ...prev,
      [field]: { ...prev[field], value },
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const data: Record<string, string> = { mode };

      // Only send keys that were edited (skip masked/unchanged fields)
      for (const [field, state] of Object.entries(keys)) {
        if (state.editing && state.value) {
          data[field] = state.value;
        }
      }

      const result = await updateStripeSettings(data);

      if (result.success && result.data) {
        const d = result.data;
        setMode(d.mode);
        setUsingEnvFallback(d.using_env_fallback);
        setKeys({
          test_secret_key: { value: d.test_secret_key, editing: false, originalValue: d.test_secret_key },
          test_publishable_key: { value: d.test_publishable_key, editing: false, originalValue: d.test_publishable_key },
          live_secret_key: { value: d.live_secret_key, editing: false, originalValue: d.live_secret_key },
          live_publishable_key: { value: d.live_publishable_key, editing: false, originalValue: d.live_publishable_key },
          test_webhook_secret: { value: d.test_webhook_secret || '', editing: false, originalValue: d.test_webhook_secret || '' },
          live_webhook_secret: { value: d.live_webhook_secret || '', editing: false, originalValue: d.live_webhook_secret || '' },
        });
        setSuccess('Stripe設定を保存しました');
      } else {
        setError(result.error || 'Failed to save settings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function renderKeyField(field: string, label: string, placeholder: string) {
    const state = keys[field];
    const isValid = validatePrefix(field, state.value);
    const isSecret = field.includes('secret');

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
        <div className="flex gap-2">
          <input
            type={state.editing && isSecret ? 'password' : 'text'}
            value={state.value}
            onChange={(e) => handleKeyChange(field, e.target.value)}
            disabled={!state.editing}
            placeholder={state.editing ? placeholder : ''}
            className={`flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent font-mono text-sm ${
              state.editing
                ? isValid
                  ? 'border-green-300 focus:ring-green-500 bg-white'
                  : 'border-red-300 focus:ring-red-500 bg-red-50'
                : 'border-gray-300 bg-gray-50 text-gray-500'
            }`}
          />
          {state.editing ? (
            <button
              type="button"
              onClick={() => handleCancelEdit(field)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleEditField(field)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              変更
            </button>
          )}
        </div>
        {state.editing && !isValid && state.value && (
          <p className="mt-1 text-xs text-red-500">
            プレフィックスが不正です。{EXPECTED_PREFIXES[field]?.join(' or ')} で始まる必要があります
          </p>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Stripe設定</h1>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-600">
          {success}
        </div>
      )}

      {/* Status Banner */}
      <div
        className={`p-4 rounded-lg border ${
          mode === 'test'
            ? 'bg-yellow-50 border-yellow-300 text-yellow-800'
            : 'bg-green-50 border-green-300 text-green-800'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{mode === 'test' ? '🟡' : '🟢'}</span>
          <span className="font-medium">
            {mode === 'test' ? 'テストモード' : 'ライブモード'}
          </span>
          {usingEnvFallback && (
            <span className="text-sm opacity-75">
              （環境変数のキーを使用中）
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Mode Selector */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">モード</h2>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setMode('test')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-colors ${
                mode === 'test'
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              }`}
            >
              <span className="text-lg mr-2">🟡</span>テスト
            </button>
            <button
              type="button"
              onClick={() => setMode('live')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-colors ${
                mode === 'live'
                  ? 'border-green-400 bg-green-50 text-green-800'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              }`}
            >
              <span className="text-lg mr-2">🟢</span>ライブ
            </button>
          </div>
        </div>

        {/* Test Keys */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            テスト用キー
          </h2>
          <div className="space-y-4">
            {renderKeyField(
              'test_secret_key',
              'Secret Key',
              'sk_test_...'
            )}
            {renderKeyField(
              'test_publishable_key',
              'Publishable Key',
              'pk_test_...'
            )}
            {renderKeyField(
              'test_webhook_secret',
              'Webhook Secret',
              'whsec_...'
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Webhook SecretはStripe Dashboard → Developers → Webhooks → エンドポイント詳細から取得できます
          </p>
        </div>

        {/* Live Keys */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            ライブ用キー
          </h2>
          <div className="space-y-4">
            {renderKeyField(
              'live_secret_key',
              'Secret Key',
              'sk_live_... or rk_live_...'
            )}
            {renderKeyField(
              'live_publishable_key',
              'Publishable Key',
              'pk_live_...'
            )}
            {renderKeyField(
              'live_webhook_secret',
              'Webhook Secret',
              'whsec_...'
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Webhook SecretはStripe Dashboard → Developers → Webhooks → エンドポイント詳細から取得できます
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}
