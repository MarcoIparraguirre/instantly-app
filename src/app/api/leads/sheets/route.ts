import { NextRequest, NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/core/services/GoogleSheetsService';
import { container } from '@/core/container';
import { v4 as uuidv4 } from 'uuid';
import { Lead } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sheetUrlOrId, campaignId, accessToken } = body;

    if (!sheetUrlOrId) {
      return NextResponse.json({ error: 'Google Sheet URL or ID is required.' }, { status: 400 });
    }

    const sheetsService = new GoogleSheetsService();
    const rows = await sheetsService.fetchSheetRows(sheetUrlOrId, accessToken);
    const mapped = sheetsService.mapRowsToLeads(rows);
    const detectedColumns = sheetsService.getDetectedColumns(rows);

    if (mapped.length === 0) {
      return NextResponse.json(
        { error: 'No valid leads found in Sheet. Ensure there is an "email" (or "correo") column.' },
        { status: 400 }
      );
    }

    const targetCampaignId = campaignId || 'campaign-1';

    const newLeads: Lead[] = mapped.map(item => ({
      id: uuidv4(),
      campaignId: targetCampaignId,
      email: item.email,
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      companyName: item.companyName || '',
      website: item.website || '',
      status: 'pending',
      currentStep: 1,
      customVariables: item.customVariables || {}
    }));

    await container.leadRepo.addLeads(newLeads);

    return NextResponse.json({
      success: true,
      importedCount: newLeads.length,
      detectedColumns,
      leads: newLeads,
      sample: newLeads.slice(0, 3)
    });
  } catch (err: any) {
    console.error('Error importing from Google Sheets:', err);
    return NextResponse.json({ error: err.message || 'Failed to import Google Sheet' }, { status: 500 });
  }
}
