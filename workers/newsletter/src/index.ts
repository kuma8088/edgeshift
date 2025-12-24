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
import {
  createSequence,
  getSequence,
  listSequences,
  updateSequence,
  deleteSequence,
  enrollSubscriber,
  getSubscriberProgress,
  getSequenceSubscribers,
} from './routes/sequences';
import { processScheduledCampaigns } from './scheduled';
import { handleResendWebhook } from './routes/webhook';
import { getDashboardStats } from './routes/dashboard';
import {
  handleGetCampaignTracking,
  handleGetCampaignClicks,
  handleGetSubscriberEngagement,
} from './routes/tracking';

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
      } else if (path.match(/^\/api\/campaigns\/[^\/]+\/tracking$/) && request.method === 'GET') {
        const id = path.replace('/api/campaigns/', '').replace('/tracking', '');
        response = await handleGetCampaignTracking(request, env, id);
      } else if (path.match(/^\/api\/campaigns\/[^\/]+\/clicks$/) && request.method === 'GET') {
        const id = path.replace('/api/campaigns/', '').replace('/clicks', '');
        response = await handleGetCampaignClicks(request, env, id);
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
      // Sequence routes
      else if (path === '/api/sequences' && request.method === 'POST') {
        response = await createSequence(request, env);
      } else if (path === '/api/sequences' && request.method === 'GET') {
        response = await listSequences(request, env);
      } else if (path.match(/^\/api\/sequences\/[^\/]+$/) && request.method === 'GET') {
        const id = path.replace('/api/sequences/', '');
        response = await getSequence(request, env, id);
      } else if (path.match(/^\/api\/sequences\/[^\/]+$/) && request.method === 'PUT') {
        const id = path.replace('/api/sequences/', '');
        response = await updateSequence(request, env, id);
      } else if (path.match(/^\/api\/sequences\/[^\/]+$/) && request.method === 'DELETE') {
        const id = path.replace('/api/sequences/', '');
        response = await deleteSequence(request, env, id);
      } else if (path.match(/^\/api\/sequences\/[^\/]+\/enroll$/) && request.method === 'POST') {
        const id = path.replace('/api/sequences/', '').replace('/enroll', '');
        response = await enrollSubscriber(request, env, id);
      } else if (path.match(/^\/api\/sequences\/[^\/]+\/subscribers$/) && request.method === 'GET') {
        const id = path.replace('/api/sequences/', '').replace('/subscribers', '');
        response = await getSequenceSubscribers(request, env, id);
      } else if (path.match(/^\/api\/subscribers\/[^\/]+\/sequences$/) && request.method === 'GET') {
        const id = path.replace('/api/subscribers/', '').replace('/sequences', '');
        response = await getSubscriberProgress(request, env, id);
      } else if (path.match(/^\/api\/subscribers\/[^\/]+\/engagement$/) && request.method === 'GET') {
        const id = path.replace('/api/subscribers/', '').replace('/engagement', '');
        response = await handleGetSubscriberEngagement(request, env, id);
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
      } else if (path === '/api/webhooks/resend' && request.method === 'POST') {
        response = await handleResendWebhook(request, env);
      } else if (path === '/api/dashboard/stats' && request.method === 'GET') {
        response = await getDashboardStats(request, env);
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

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    console.log(`Cron trigger fired at ${new Date(event.scheduledTime).toISOString()}`);
    try {
      const result = await processScheduledCampaigns(env);
      console.log(
        `Scheduled campaign processing completed: ${result.processed} processed, ${result.sent} sent, ${result.failed} failed`
      );
    } catch (error) {
      console.error('Error in scheduled handler:', error);
    }
  },
};
