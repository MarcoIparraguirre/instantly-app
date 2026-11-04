import { NextRequest, NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/core/services/GoogleSheetsService';
import { container } from '@/core/container';
import { v4 as uuidv4 } from 'uuid';
import { Lead } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      campaignId,
      rows,
      emailColumn,
      selectedColumns
    }: {
      campaignId?: string;
      rows?: Record<string, string>[];
      emailColumn?: string;
      selectedColumns?: string[];
    } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'No se recibieron filas para sincronizar.' },
        { status: 400 }
      );
    }

    const targetCampaignId = campaignId || 'campaign-1';
    const sheetsService = new GoogleSheetsService();
    const detectedCols = sheetsService.getDetectedColumns(rows);
    const activeEmailCol = emailColumn || sheetsService.detectEmailColumn(detectedCols, rows);
    const activeSelectedCols = Array.isArray(selectedColumns) ? selectedColumns : detectedCols;

    const mappedRows = sheetsService.mapRowsWithSelection(rows, activeEmailCol, activeSelectedCols);

    if (mappedRows.length === 0) {
      return NextResponse.json(
        {
          error: `No se encontraron correos válidos en la columna "${activeEmailCol}". Verifica que la columna seleccionada contenga direcciones con "@".`
        },
        { status: 400 }
      );
    }

    // Deduplicate incoming rows by lowercase email (keep latest row in file if duplicated)
    const uniqueIncomingMap = new Map<string, (typeof mappedRows)[0]>();
    for (const item of mappedRows) {
      const normEmail = item.email.toLowerCase().trim();
      uniqueIncomingMap.set(normEmail, item);
    }

    // Load existing leads for this campaign to perform incremental sync
    const existingLeads = await container.leadRepo.getLeads(targetCampaignId);
    const existingByEmail = new Map<string, Lead>();
    for (const lead of existingLeads) {
      if (lead.email) {
        existingByEmail.set(lead.email.toLowerCase().trim(), lead);
      }
    }

    let newAddedCount = 0;
    let updatedPendingCount = 0;
    let skippedSentCount = 0;
    const leadsToUpsert: Lead[] = [];
    const selectedSet = new Set(activeSelectedCols);

    for (const [normEmail, item] of uniqueIncomingMap.entries()) {
      const existing = existingByEmail.get(normEmail);

      if (existing) {
        // Lead already exists in this campaign!
        // Preserve status ('sent', 'replied', 'opened', 'pending') and lastContactedAt
        const updatedLead: Lead = {
          ...existing,
          firstName: item.firstName || existing.firstName || '',
          lastName: item.lastName || existing.lastName || '',
          companyName: item.companyName || existing.companyName || '',
          website: item.website || existing.website || '',
          customVariables: item.customVariables || {}
        };

        if (existing.status !== 'pending') {
          skippedSentCount++;
        } else {
          updatedPendingCount++;
        }

        leadsToUpsert.push(updatedLead);
        existingByEmail.delete(normEmail);
      } else {
        // Brand new lead -> insert as 'pending'
        const newLead: Lead = {
          id: uuidv4(),
          campaignId: targetCampaignId,
          email: item.email.trim(),
          firstName: item.firstName || '',
          lastName: item.lastName || '',
          companyName: item.companyName || '',
          website: item.website || '',
          status: 'pending',
          currentStep: 1,
          customVariables: item.customVariables || {}
        };
        newAddedCount++;
        leadsToUpsert.push(newLead);
      }
    }

    // Also prune unselected customVariables from any remaining existing leads in the campaign
    // so only the user's selected columns appear in the editor
    for (const remainingLead of existingByEmail.values()) {
      if (remainingLead.customVariables) {
        const filteredVars: Record<string, string> = {};
        for (const [k, v] of Object.entries(remainingLead.customVariables)) {
          if (selectedSet.has(k)) {
            filteredVars[k] = v;
          }
        }
        leadsToUpsert.push({
          ...remainingLead,
          customVariables: filteredVars
        });
      }
    }

    await container.leadRepo.addLeads(leadsToUpsert);

    return NextResponse.json({
      success: true,
      newAddedCount,
      updatedPendingCount,
      skippedSentCount,
      totalProcessed: uniqueIncomingMap.size,
      selectedColumns: activeSelectedCols,
      leads: leadsToUpsert
    });
  } catch (err: any) {
    console.error('Error syncing leads:', err);
    return NextResponse.json(
      { error: err.message || 'Error al sincronizar los contactos en la base de datos' },
      { status: 500 }
    );
  }
}
