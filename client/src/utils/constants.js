export const LEAD_STATUSES = [
  'New', 'Attempted Contact', 'Contacted', 'Meeting Booked',
  'Qualified', 'Converted', 'Not Qualified', 'Junk'
];

export const DEAL_STAGES = [
  'Prospect', 'Qualified', 'Contacted', 'Proposal Sent', 'Demo Done',
  'Negotiation', 'Verbal Agreement', 'Contract Sent', 'Closed Won', 'Closed Lost',
];

export const STAGE_MAP = {
  'Prospect':         { probability: 10,  forecast_category: 'Pipeline' },
  'Qualified':        { probability: 25,  forecast_category: 'Pipeline' },
  'Contacted':        { probability: 30,  forecast_category: 'Pipeline' },
  'Proposal Sent':    { probability: 50,  forecast_category: 'Best Case' },
  'Demo Done':        { probability: 60,  forecast_category: 'Best Case' },
  'Negotiation':      { probability: 75,  forecast_category: 'Commit' },
  'Verbal Agreement': { probability: 85,  forecast_category: 'Commit' },
  'Contract Sent':    { probability: 90,  forecast_category: 'Commit' },
  'Closed Won':       { probability: 100, forecast_category: 'Closed Won' },
  'Closed Lost':      { probability: 0,   forecast_category: 'Omitted' },
};

export const STAGE_COLOURS = {
  'Prospect':         'bg-gray-100 text-gray-700',
  'Qualified':        'bg-gray-100 text-gray-700',
  'Contacted':        'bg-gray-100 text-gray-700',
  'Proposal Sent':    'bg-blue-100 text-blue-700',
  'Demo Done':        'bg-blue-100 text-blue-700',
  'Negotiation':      'bg-amber-100 text-amber-800',
  'Verbal Agreement': 'bg-amber-100 text-amber-800',
  'Contract Sent':    'bg-amber-100 text-amber-800',
  'Closed Won':       'bg-green-100 text-green-800',
  'Closed Lost':      'bg-red-100 text-red-700',
};

export const FORECAST_COLOURS = {
  'Pipeline':   'bg-gray-100 text-gray-600',
  'Best Case':  'bg-blue-100 text-blue-700',
  'Commit':     'bg-amber-100 text-amber-800',
  'Closed Won': 'bg-green-100 text-green-800',
  'Omitted':    'bg-red-100 text-red-700',
};

export const PRIORITY_COLOURS = {
  'P1 - Act Now': 'bg-red-100 text-red-700',
  'P2 - This Month': 'bg-orange-100 text-orange-700',
  'P3 - Pipeline': 'bg-yellow-100 text-yellow-700',
  'Parked': 'bg-gray-100 text-gray-500'
};

export const BUSINESS_UNITS = ['ASC', 'Simply Seated'];

export const LEAD_SOURCES = [
  'Cold Outreach', 'Event Announcement', 'Referral', 'LinkedIn',
  'Website', 'Partner', 'Conference', 'Other'
];

export const INDUSTRIES = [
  'Banking & Finance', 'Insurance', 'Government', 'Healthcare', 'Legal',
  'Technology', 'Telecommunications', 'Events & Hospitality', 'Venues', 'Corporate', 'Other'
];

export const ACTIVITY_TYPES = ['Call', 'Meeting', 'Email', 'LinkedIn', 'Demo', 'Other'];

export const ACTIVITY_OUTCOMES = [
  'No Answer', 'Left Message', 'Spoke - Positive', 'Spoke - Neutral',
  'Spoke - Not Interested', 'Email Sent', 'Email Replied', 'Meeting Booked',
  'Demo Booked', 'Proposal Requested'
];

export const TASK_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Deferred', 'Waiting on Input'];
export const TASK_PRIORITIES = ['High', 'Normal', 'Low'];
export const TARGET_TYPES = ['Direct Customer', 'Partner', 'Referral'];
export const DEAL_TYPES = ['Direct Customer', 'Partner', 'Referral'];

export const CONTACT_ROLES = ['Primary', 'Operations', 'Billing', 'Technical', 'Executive', 'Other'];

export const UNIT_TYPES = ['per month', 'per seat/month', 'per day', 'per item', 'per project', 'flat fee'];

export const FORECAST_CATEGORIES = ['Pipeline', 'Best Case', 'Commit', 'Closed Won', 'Omitted'];
