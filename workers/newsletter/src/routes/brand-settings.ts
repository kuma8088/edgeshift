import type { Env, BrandSettings, UpdateBrandSettingsRequest } from '../types';
import { isAuthorizedAsync } from '../lib/auth';
import { errorResponse, successResponse } from '../lib/response';
import { getDefaultBrandSettings } from '../lib/templates';

export async function getBrandSettings(
  request: Request,
  env: Env
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const settings = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    if (!settings) {
      return successResponse(getDefaultBrandSettings());
    }

    return successResponse(settings);
  } catch (error) {
    console.error('Get brand settings error:', error);
    return errorResponse('Internal server error', 500);
  }
}

export async function updateBrandSettings(
  request: Request,
  env: Env
): Promise<Response> {
  if (!(await isAuthorizedAsync(request, env))) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const body: UpdateBrandSettingsRequest = await request.json();
    const now = Math.floor(Date.now() / 1000);

    const existing = await env.DB.prepare(
      'SELECT id FROM brand_settings WHERE id = ?'
    ).bind('default').first();

    if (existing) {
      const updates: string[] = [];
      const values: (string | number | null)[] = [];

      if (body.logo_url !== undefined) {
        updates.push('logo_url = ?');
        values.push(body.logo_url);
      }
      if (body.primary_color !== undefined) {
        updates.push('primary_color = ?');
        values.push(body.primary_color);
      }
      if (body.secondary_color !== undefined) {
        updates.push('secondary_color = ?');
        values.push(body.secondary_color);
      }
      if (body.footer_text !== undefined) {
        updates.push('footer_text = ?');
        values.push(body.footer_text);
      }
      if (body.default_template_id !== undefined) {
        updates.push('default_template_id = ?');
        values.push(body.default_template_id);
      }

      updates.push('updated_at = ?');
      values.push(now);
      values.push('default');

      await env.DB.prepare(
        `UPDATE brand_settings SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...values).run();
    } else {
      const defaults = getDefaultBrandSettings();
      await env.DB.prepare(`
        INSERT INTO brand_settings (id, logo_url, primary_color, secondary_color, footer_text, default_template_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        'default',
        body.logo_url ?? defaults.logo_url,
        body.primary_color ?? defaults.primary_color,
        body.secondary_color ?? defaults.secondary_color,
        body.footer_text ?? defaults.footer_text,
        body.default_template_id ?? defaults.default_template_id,
        now,
        now
      ).run();
    }

    const updated = await env.DB.prepare(
      'SELECT * FROM brand_settings WHERE id = ?'
    ).bind('default').first<BrandSettings>();

    return successResponse(updated);
  } catch (error) {
    console.error('Update brand settings error:', error);
    return errorResponse('Internal server error', 500);
  }
}
