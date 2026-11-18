import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveSpintax, resolveVariations } from '@/lib/spintax';
import { TemplateRenderer } from '@/core/services/TemplateRenderer';
import { Lead } from '@/types';

describe('UX & CampaignEditor Improvements', () => {
  it('correctly replaces dynamic custom variables and standard fields in templates', () => {
    const renderer = new TemplateRenderer();
    const testLead: Partial<Lead> = {
      firstName: 'Marcos',
      lastName: 'Iparraguirre',
      companyName: 'Vectra Systems',
      email: 'marcos@vectrasystems.com.ar',
      website: 'https://vectrasystems.com.ar',
      customVariables: {
        Cargo: 'Director de Operaciones',
        Ciudad: 'Buenos Aires',
        Industria: 'Fintech'
      }
    };

    const template = 'Hola {{firstName}}, vi que en {{companyName}} buscas optimizar procesos para el rol de {{Cargo}} en {{Ciudad}}.';
    const rendered = renderer.render(template, testLead);

    expect(rendered).toContain('Hola Marcos');
    expect(rendered).toContain('en Vectra Systems buscas');
    expect(rendered).toContain('rol de Director de Operaciones');
    expect(rendered).toContain('en Buenos Aires');
    expect(rendered).not.toContain('{{firstName}}');
    expect(rendered).not.toContain('{{companyName}}');
    expect(rendered).not.toContain('{{Cargo}}');
    expect(rendered).not.toContain('{{Ciudad}}');
  });

  it('re-rolls spintax variations reliably and resolves options', () => {
    const spintax = '{Hola|Buenos días|Estimado} colega';
    const variations = resolveVariations(spintax, 10);

    expect(variations.length).toBeGreaterThan(0);
    const allValid = variations.every(v =>
      v === 'Hola colega' || v === 'Buenos días colega' || v === 'Estimado colega'
    );
    expect(allValid).toBe(true);

    const single1 = resolveSpintax(spintax);
    expect(['Hola colega', 'Buenos días colega', 'Estimado colega']).toContain(single1);
  });

  it('verifies sticky left positioning for frozen primary columns in LeadFinderView and CampaignEditor', () => {
    const leadFinderCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/LeadFinderView.tsx'), 'utf-8');
    const campaignEditorCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CampaignEditor.tsx'), 'utf-8');

    // LeadFinderView should freeze checkbox (left-0), name (left-12), and email (left-[192px])
    expect(leadFinderCode).toContain('sticky left-0');
    expect(leadFinderCode).toContain('sticky left-12');
    expect(leadFinderCode).toContain('sticky left-[192px]');

    // CampaignEditor Step 1 should freeze row/checkbox (left-0), name (left-12), and email (left-[192px])
    expect(campaignEditorCode).toContain('sticky left-0');
    expect(campaignEditorCode).toContain('sticky left-12');
    expect(campaignEditorCode).toContain('sticky left-[192px]');
  });

  it('verifies Escape key listeners and darkened backdrop click handlers in all modals', () => {
    const leadImportCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/LeadImportModal.tsx'), 'utf-8');
    const sendTestCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SendTestEmailModal.tsx'), 'utf-8');
    const editLeadCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/EditLeadModal.tsx'), 'utf-8');
    const campaignEditorCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CampaignEditor.tsx'), 'utf-8');

    // All modals must listen for Escape
    for (const code of [leadImportCode, sendTestCode, editLeadCode, campaignEditorCode]) {
      expect(code).toContain("e.key === 'Escape'");
      expect(code).toContain('onClick=');
      expect(code).toContain('bg-black/75');
      expect(code).toContain('stopPropagation()');
    }
  });

  it('verifies Live Preview and Editor tabs contain responsive desktop (640px) and mobile (375px) containers', () => {
    const campaignEditorCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CampaignEditor.tsx'), 'utf-8');

    expect(campaignEditorCode).toContain("previewDevice === 'mobile' ? 'max-w-[375px]' : 'max-w-[640px]'");
    expect(campaignEditorCode).toContain('📱 Mobile Mail (375px)');
    expect(campaignEditorCode).toContain('💻 Desktop Mail (640px)');
    expect(campaignEditorCode).toContain('setPreviewRandomSeed');
  });
});
