import { Container } from 'typedi';
import { License } from '@/License';
import type { ILicenseReadResponse } from '@/Interfaces';
import { WorkflowRepository } from '@db/repositories/workflow.repository';

export class LicenseService {
	static async getActiveTriggerCount(): Promise<number> {
		const totalTriggerCount = await Container.get(WorkflowRepository).sum('triggerCount', {
			active: true,
		});
		return totalTriggerCount ?? 0;
	}

	// Helper for getting the basic license data that we want to return
	static async getLicenseData(): Promise<ILicenseReadResponse> {
		const triggerCount = await LicenseService.getActiveTriggerCount();
		const license = Container.get(License);
		const mainPlan = license.getMainPlan();

		return {
			usage: {
				executions: {
					value: triggerCount,
					limit: license.getTriggerLimit(),
					warningThreshold: 0.8,
				},
			},
			license: {
				planId: mainPlan?.productId ?? '',
				planName: license.getPlanName(),
			},
		};
	}
}
