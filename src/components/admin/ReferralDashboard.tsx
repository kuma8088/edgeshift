import { useEffect, useState } from 'react';
import {
  getReferralStats,
  getMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  type ReferralMilestone,
  type ReferralStatsResponse,
  type RewardType,
} from '../../utils/admin-api';

interface MilestoneFormData {
  threshold: number;
  name: string;
  description: string;
  reward_type: RewardType;
  reward_value: string;
}

const initialFormData: MilestoneFormData = {
  threshold: 0,
  name: '',
  description: '',
  reward_type: 'badge',
  reward_value: '',
};

export function ReferralDashboard() {
  const [stats, setStats] = useState<ReferralStatsResponse | null>(null);
  const [milestones, setMilestones] = useState<ReferralMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Milestone form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<MilestoneFormData>(initialFormData);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [statsResult, milestonesResult] = await Promise.all([
        getReferralStats(),
        getMilestones(),
      ]);

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
      }

      if (milestonesResult.success && milestonesResult.data) {
        setMilestones(milestonesResult.data);
      }
    } catch (e) {
      setError('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setFormData(initialFormData);
    setEditingId(null);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditForm(milestone: ReferralMilestone) {
    setFormData({
      threshold: milestone.threshold,
      name: milestone.name,
      description: milestone.description || '',
      reward_type: milestone.reward_type || 'badge',
      reward_value: milestone.reward_value || '',
    });
    setEditingId(milestone.id);
    setFormError(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(initialFormData);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      if (editingId) {
        const result = await updateMilestone(editingId, formData);
        if (!result.success) {
          setFormError(result.error || 'Failed to update milestone');
          return;
        }
      } else {
        const result = await createMilestone(formData);
        if (!result.success) {
          setFormError(result.error || 'Failed to create milestone');
          return;
        }
      }

      closeForm();
      await loadData();
    } catch (e) {
      setFormError('An error occurred');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this milestone?')) {
      return;
    }

    try {
      const result = await deleteMilestone(id);
      if (result.success) {
        await loadData();
      } else {
        setError(result.error || 'Failed to delete milestone');
      }
    } catch (e) {
      setError('An error occurred while deleting');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Stats Overview */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--color-text)] mb-4">
          統計概要
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] p-6">
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">総紹介数</p>
            <p className="text-3xl font-bold text-[var(--color-accent)]">
              {stats?.total_referrals || 0}
            </p>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] p-6">
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">アクティブな紹介者</p>
            <p className="text-3xl font-bold text-[var(--color-text)]">
              {stats?.active_referrers || 0}
            </p>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] p-6">
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">平均紹介数</p>
            <p className="text-3xl font-bold text-[var(--color-text)]">
              {stats?.active_referrers
                ? (stats.total_referrals / stats.active_referrers).toFixed(1)
                : 0}
            </p>
          </div>
        </div>
      </section>

      {/* Top Referrers */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--color-text)] mb-4">
          トップ紹介者
        </h2>
        <div className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] overflow-hidden">
          {stats?.top_referrers && stats.top_referrers.length > 0 ? (
            <table className="w-full">
              <thead className="bg-[var(--color-bg-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-secondary)]">
                    順位
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-secondary)]">
                    メールアドレス
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-secondary)]">
                    紹介数
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {stats.top_referrers.map((referrer, index) => (
                  <tr key={referrer.id} className="hover:bg-[var(--color-bg-secondary)]">
                    <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                      #{index + 1}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                      {referrer.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text)] text-right">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--color-accent)] text-white">
                        {referrer.referral_count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-[var(--color-text-secondary)]">
              まだ紹介者がいません
            </div>
          )}
        </div>
      </section>

      {/* Milestones Management */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">
            マイルストーン設定
          </h2>
          <button
            onClick={openCreateForm}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            + 追加
          </button>
        </div>

        <div className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] overflow-hidden">
          {milestones.length > 0 ? (
            <table className="w-full">
              <thead className="bg-[var(--color-bg-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-secondary)]">
                    しきい値
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-secondary)]">
                    名前
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-secondary)]">
                    報酬タイプ
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--color-text-secondary)]">
                    報酬値
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-[var(--color-text-secondary)]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {milestones.map((milestone) => (
                  <tr key={milestone.id} className="hover:bg-[var(--color-bg-secondary)]">
                    <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                      {milestone.threshold}人
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                      {milestone.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                      {milestone.reward_type || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                      {milestone.reward_value || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEditForm(milestone)}
                        className="text-[var(--color-accent)] hover:underline text-sm mr-4"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(milestone.id)}
                        className="text-red-600 hover:underline text-sm"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-[var(--color-text-secondary)]">
              マイルストーンが設定されていません
            </div>
          )}
        </div>
      </section>

      {/* Milestone Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">
              {editingId ? 'マイルストーンを編集' : 'マイルストーンを追加'}
            </h3>

            {formError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  しきい値（紹介数）
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.threshold}
                  onChange={(e) => setFormData({ ...formData, threshold: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-bg)] text-[var(--color-text)]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  名前
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-bg)] text-[var(--color-text)]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  説明
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-bg)] text-[var(--color-text)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  報酬タイプ
                </label>
                <select
                  value={formData.reward_type}
                  onChange={(e) => setFormData({ ...formData, reward_type: e.target.value as RewardType })}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-bg)] text-[var(--color-text)]"
                >
                  <option value="badge">バッジ</option>
                  <option value="discount">割引</option>
                  <option value="content">コンテンツ</option>
                  <option value="custom">カスタム</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                  報酬値
                </label>
                <input
                  type="text"
                  value={formData.reward_value}
                  onChange={(e) => setFormData({ ...formData, reward_value: e.target.value })}
                  placeholder="例: bronze, silver, gold"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-bg)] text-[var(--color-text)]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[var(--color-accent)] text-white rounded hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
                >
                  {submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
