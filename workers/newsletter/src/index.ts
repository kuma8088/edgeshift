import type { Env } from './types';
import { handleSubscribe } from './routes/subscribe';
import { handleConfirm } from './routes/confirm';
import { handleUnsubscribe } from './routes/unsubscribe';
import { handleBroadcast, handleGetSubscribers } from './routes/broadcast';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
} from './routes/campaigns';
import { sendCampaign, getCampaignStats } from './routes/campaign-send';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      let response: Response;

      // Route matching
      // Campaign routes
      if (path === '/api/campaigns' && request.method === 'POST') {
        response = await createCampaign(request, env);
      } else if (path === '/api/campaigns' && request.method === 'GET') {
        response = await listCampaigns(request, env);
      } else if (path.match(/^\/api\/campaigns\/[^\/]+\/send$/) && request.method === 'POST') {
        const id = path.replace('/api/campaigns/', '').replace('/send', '');
        response = await sendCampaign(request, env, id);
      } else if (path.match(/^\/api\/campaigns\/[^\/]+\/stats$/) && request.method === 'GET') {
        const id = path.replace('/api/campaigns/', '').replace('/stats', '');
        response = await getCampaignStats(request, env, id);
      } else if (path.match(/^\/api\/campaigns\/[^\/]+$/) && request.method === 'GET') {
        const id = path.replace('/api/campaigns/', '');
        response = await getCampaign(request, env, id);
      } else if (path.match(/^\/api\/campaigns\/[^\/]+$/) && request.method === 'PUT') {
        const id = path.replace('/api/campaigns/', '');
        response = await updateCampaign(request, env, id);
      } else if (path.match(/^\/api\/campaigns\/[^\/]+$/) && request.method === 'DELETE') {
        const id = path.replace('/api/campaigns/', '');
        response = await deleteCampaign(request, env, id);
      }
      // Newsletter routes
      else if (path === '/api/newsletter/subscribe' && request.method === 'POST') {
        response = await handleSubscribe(request, env);
      } else if (path.startsWith('/api/newsletter/confirm/') && request.method === 'GET') {
        const token = path.replace('/api/newsletter/confirm/', '');
        response = await handleConfirm(request, env, token);
      } else if (path.startsWith('/api/newsletter/unsubscribe/') && request.method === 'GET') {
        const token = path.replace('/api/newsletter/unsubscribe/', '');
        response = await handleUnsubscribe(request, env, token);
      } else if (path === '/api/newsletter/broadcast' && request.method === 'POST') {
        response = await handleBroadcast(request, env);
      } else if (path === '/api/newsletter/subscribers' && request.method === 'GET') {
        response = await handleGetSubscribers(request, env);
      } else {
        response = new Response(
          JSON.stringify({ success: false, error: 'Not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Add CORS headers to response (except redirects)
      if (response.status < 300 || response.status >= 400) {
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          newHeaders.set(key, value);
        });
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

      return response;
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Internal server error' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
  },
};
