import type { Env } from './types';
import { handleSubscribe } from './routes/subscribe';
import { handleConfirm } from './routes/confirm';
import { handleUnsubscribe } from './routes/unsubscribe';
import { handleBroadcast, handleGetSubscribers, handleGetSubscriber, handleUpdateSubscriber } from './routes/broadcast';
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
  handleGetSequenceStats,
} from './routes/tracking';
import { handleGetAnalyticsOverview } from './routes/analytics';
import {
  handleGetSignupPages,
  handleGetSignupPage,
  handleGetSignupPageBySlug,
  handleGetPublicSignupPages,
  handleCreateSignupPage,
  handleUpdateSignupPage,
  handleDeleteSignupPage,
} from './routes/signup-pages';
import {
  handleGetContactLists,
  handleGetContactList,
  handleCreateContactList,
  handleUpdateContactList,
  handleDeleteContactList,
  handleGetListMembers,
  handleAddMembers,
  handleRemoveMember,
  handleGetSubscriberLists,
  handleAddSubscriberToList,
  handleRemoveSubscriberFromList,
} from './routes/contact-lists';
import { getArchiveList, getArchiveArticle } from './routes/archive';
import {
  handleGetReferralDashboard,
  handleGetMilestones,
  handleCreateMilestone,
  handleUpdateMilestone,
  handleDeleteMilestone,
  handleGetReferralStats,
} from './routes/referral';
import { getBrandSettings, updateBrandSettings } from './routes/brand-settings';
import { getTemplates, previewTemplate, testSendTemplate } from './routes/templates';
import { handleImageUpload, handleListImages } from './routes/images';
import { isAuthorizedAsync } from './lib/auth';

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
      let response: Response = new Response(
        JSON.stringify({ success: false, error: 'Not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );

      // Route matching
      // Archive routes (public, no auth)
      if (path === '/api/archive' && request.method === 'GET') {
        response = await getArchiveList(request, env);
      } else if (path.match(/^\/api\/archive\/[^\/]+$/) && request.method === 'GET') {
        const slug = path.replace('/api/archive/', '');
        response = await getArchiveArticle(request, env, slug);
      }
      // Brand Settings routes (Email Templates)
      else if (path === '/api/brand-settings' && request.method === 'GET') {
        response = await getBrandSettings(request, env);
      } else if (path === '/api/brand-settings' && request.method === 'PUT') {
        response = await updateBrandSettings(request, env);
      }
      // Templates routes (Email Templates)
      else if (path === '/api/templates' && request.method === 'GET') {
        response = await getTemplates(request, env);
      } else if (path === '/api/templates/preview' && request.method === 'POST') {
        response = await previewTemplate(request, env);
      } else if (path === '/api/templates/test-send' && request.method === 'POST') {
        response = await testSendTemplate(request, env);
      }
      // Contact Lists routes (Batch 4C)
      else
      if (path === '/api/contact-lists' && request.method === 'GET') {
        response = await handleGetContactLists(request, env);
      } else if (path === '/api/contact-lists' && request.method === 'POST') {
        response = await handleCreateContactList(request, env);
      } else if (path.match(/^\/api\/contact-lists\/[^\/]+\/members$/)) {
        const listId = path.replace('/api/contact-lists/', '').replace('/members', '');

        if (request.method === 'GET') {
          response = await handleGetListMembers(request, env, listId);
        } else if (request.method === 'POST') {
          response = await handleAddMembers(request, env, listId);
        }
      } else if (path.match(/^\/api\/contact-lists\/[^\/]+\/members\/[^\/]+$/)) {
        const parts = path.replace('/api/contact-lists/', '').split('/');
        const listId = parts[0];
        const subscriberId = parts[2];

        if (request.method === 'DELETE') {
          response = await handleRemoveMember(request, env, listId, subscriberId);
        }
      } else if (path.match(/^\/api\/contact-lists\/[^\/]+$/) && request.method === 'GET') {
        const id = path.replace('/api/contact-lists/', '');
        response = await handleGetContactList(request, env, id);
      } else if (path.match(/^\/api\/contact-lists\/[^\/]+$/) && request.method === 'PUT') {
        const id = path.replace('/api/contact-lists/', '');
        response = await handleUpdateContactList(request, env, id);
      } else if (path.match(/^\/api\/contact-lists\/[^\/]+$/) && request.method === 'DELETE') {
        const id = path.replace('/api/contact-lists/', '');
        response = await handleDeleteContactList(request, env, id);
      } else if (path.match(/^\/api\/subscribers\/[^\/]+\/lists$/)) {
        const subscriberId = path.replace('/api/subscribers/', '').replace('/lists', '');

        if (request.method === 'GET') {
          response = await handleGetSubscriberLists(request, env, subscriberId);
        } else if (request.method === 'POST') {
          response = await handleAddSubscriberToList(request, env, subscriberId);
        }
      } else if (path.match(/^\/api\/subscribers\/[^\/]+\/lists\/[^\/]+$/)) {
        const parts = path.replace('/api/subscribers/', '').split('/');
        const subscriberId = parts[0];
        const listId = parts[2];

        if (request.method === 'DELETE') {
          response = await handleRemoveSubscriberFromList(request, env, subscriberId, listId);
        }
      }
      // Campaign routes
      else if (path === '/api/campaigns' && request.method === 'POST') {
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
      } else if (path.match(/^\/api\/sequences\/[^\/]+\/stats$/) && request.method === 'GET') {
        const id = path.replace('/api/sequences/', '').replace('/stats', '');
        response = await handleGetSequenceStats(request, env, id);
      } else if (path.match(/^\/api\/subscribers\/[^\/]+\/sequences$/) && request.method === 'GET') {
        const id = path.replace('/api/subscribers/', '').replace('/sequences', '');
        response = await getSubscriberProgress(request, env, id);
      } else if (path.match(/^\/api\/subscribers\/[^\/]+\/engagement$/) && request.method === 'GET') {
        const id = path.replace('/api/subscribers/', '').replace('/engagement', '');
        response = await handleGetSubscriberEngagement(request, env, id);
      } else if (path.match(/^\/api\/subscribers\/[^\/]+$/) && request.method === 'GET') {
        const id = path.replace('/api/subscribers/', '');
        response = await handleGetSubscriber(request, env, id);
      } else if (path.match(/^\/api\/subscribers\/[^\/]+$/) && request.method === 'PUT') {
        const id = path.replace('/api/subscribers/', '');
        response = await handleUpdateSubscriber(request, env, id);
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
      } else if (path === '/api/analytics/overview' && request.method === 'GET') {
        response = await handleGetAnalyticsOverview(request, env);
      }
      // Signup Pages routes (Batch 4A)
      else if (path === '/api/signup-pages/public' && request.method === 'GET') {
        response = await handleGetPublicSignupPages(request, env);
      } else if (path === '/api/signup-pages' && request.method === 'GET') {
        response = await handleGetSignupPages(request, env);
      } else if (path.match(/^\/api\/signup-pages\/by-slug\/[^\/]+$/) && request.method === 'GET') {
        const slug = path.replace('/api/signup-pages/by-slug/', '');
        response = await handleGetSignupPageBySlug(request, env, slug);
      } else if (path.match(/^\/api\/signup-pages\/[^\/]+$/) && request.method === 'GET') {
        const id = path.replace('/api/signup-pages/', '');
        response = await handleGetSignupPage(request, env, id);
      } else if (path === '/api/signup-pages' && request.method === 'POST') {
        response = await handleCreateSignupPage(request, env);
      } else if (path.match(/^\/api\/signup-pages\/[^\/]+$/) && request.method === 'PUT') {
        const id = path.replace('/api/signup-pages/', '');
        response = await handleUpdateSignupPage(request, env, id);
      } else if (path.match(/^\/api\/signup-pages\/[^\/]+$/) && request.method === 'DELETE') {
        const id = path.replace('/api/signup-pages/', '');
        response = await handleDeleteSignupPage(request, env, id);
      }
      // Referral routes (public)
      else if (path.match(/^\/api\/referral\/dashboard\/[^\/]+$/) && request.method === 'GET') {
        const code = path.replace('/api/referral/dashboard/', '');
        response = await handleGetReferralDashboard(request, env, code);
      }
      // Referral admin routes (auth required)
      else if (path === '/api/admin/milestones' && request.method === 'GET') {
        if (!(await isAuthorizedAsync(request, env))) {
          response = new Response(
            JSON.stringify({ success: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          response = await handleGetMilestones(request, env);
        }
      } else if (path === '/api/admin/milestones' && request.method === 'POST') {
        if (!(await isAuthorizedAsync(request, env))) {
          response = new Response(
            JSON.stringify({ success: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          response = await handleCreateMilestone(request, env);
        }
      } else if (path.match(/^\/api\/admin\/milestones\/[^\/]+$/) && request.method === 'PUT') {
        if (!(await isAuthorizedAsync(request, env))) {
          response = new Response(
            JSON.stringify({ success: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          const id = path.replace('/api/admin/milestones/', '');
          response = await handleUpdateMilestone(request, env, id);
        }
      } else if (path.match(/^\/api\/admin\/milestones\/[^\/]+$/) && request.method === 'DELETE') {
        if (!(await isAuthorizedAsync(request, env))) {
          response = new Response(
            JSON.stringify({ success: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          const id = path.replace('/api/admin/milestones/', '');
          response = await handleDeleteMilestone(request, env, id);
        }
      } else if (path === '/api/admin/referral-stats' && request.method === 'GET') {
        if (!(await isAuthorizedAsync(request, env))) {
          response = new Response(
            JSON.stringify({ success: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          response = await handleGetReferralStats(request, env);
        }
      }
      // Image routes
      else if (path === '/api/images' && request.method === 'GET') {
        response = await handleListImages(request, env);
      } else if (path === '/api/images/upload' && request.method === 'POST') {
        response = await handleImageUpload(request, env);
      }
      // Manual cron trigger endpoint for E2E testing
      else if (path === '/api/admin/trigger-cron' && request.method === 'POST') {
        if (!(await isAuthorizedAsync(request, env))) {
          response = new Response(
            JSON.stringify({ success: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        } else {
          try {
            const result = await processScheduledCampaigns(env);
            response = new Response(
              JSON.stringify({
                success: true,
                data: {
                  processed: result.processed,
                  sent: result.sent,
                  failed: result.failed
                }
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          } catch (error) {
            console.error('Manual cron trigger error:', error);
            response = new Response(
              JSON.stringify({ success: false, error: 'Internal server error' }),
              { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
          }
        }
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
