import { Injectable, Logger } from '@nestjs/common';
import { AIProvider, AIProviderResponse } from './ai-provider.interface';
import { GroundedContext } from '../tools/context-gatherer.service';
import { AIOutputZodSchema, AIOutputValidated } from '../schemas/ai-output.zod';

@Injectable()
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockAIProvider.name);

  async investigate(context: GroundedContext): Promise<AIProviderResponse> {
    const startTime = Date.now();
    this.logger.log(
      `[MockAIProvider] Generating deterministic grounded investigation for incident ${context.incident.id} (${context.incident.service})`,
    );

    // Simulate minor processing latency
    await new Promise((resolve) => setTimeout(resolve, 150));

    const primaryAlert = context.alerts[0];
    const alertCount = context.alerts.length;
    const taskCount = context.tasks.length;

    const evidenceItems: Array<{ type: string; id: string; reason: string }> = [];

    if (primaryAlert) {
      evidenceItems.push({
        type: 'alert',
        id: primaryAlert.id,
        reason: `Correlated alert "${primaryAlert.title}" on service "${primaryAlert.service}" with severity ${primaryAlert.severity}.`,
      });
    }

    evidenceItems.push({
      type: 'incident',
      id: context.incident.id,
      reason: `Active incident with severity ${context.incident.severity} and status ${context.incident.status}.`,
    });

    if (context.alerts.length > 1) {
      evidenceItems.push({
        type: 'alert',
        id: context.alerts[1].id,
        reason: `Secondary correlated alert "${context.alerts[1].title}" occurred within the 30-minute cluster window.`,
      });
    }

    const structuredOutput: AIOutputValidated = {
      summary: `Automated investigation completed for ${context.incident.service}. Root cause is identified as an upstream service bottleneck with ${alertCount} correlated telemetry alert(s) detected.`,
      hypotheses: [
        {
          title: `Upstream Connection Saturation on ${context.incident.service}`,
          explanation: `Telemetry indicates rapid spike in latency and error rates coinciding with alert "${primaryAlert ? primaryAlert.title : context.incident.title}".`,
          confidence: 88,
        },
        {
          title: `Database Resource Exhaustion or Lock Contention`,
          explanation: `Service queries experienced degradation during the cluster window, causing downstream request queues to back up.`,
          confidence: 72,
        },
      ],
      evidence: evidenceItems,
      confidence: 85,
      recommendations: [
        {
          title: 'Inspect connection pool capacity and health checks',
          explanation: `Verify that ${context.incident.service} connection pool has not exceeded threshold limits and restart unresponsive pods if memory leaks are present.`,
        },
        {
          title: 'Review recent configuration changes or deployments',
          explanation: 'Audit recent release manifests and canary flags for potential regression in network retry configs.',
        },
      ],
      proposedAction: {
        type: 'CREATE_TASK',
        description: `Create mitigation checklist task: "Scale ${context.incident.service} replica count and verify pool limits"`,
        parameters: {
          title: `Verify ${context.incident.service} pool limits & scale replica count`,
          service: context.incident.service,
          incidentId: context.incident.id,
        },
        reason: `Stabilizes ${context.incident.service} throughput and relieves saturation while deep-dive continues.`,
      },
    };

    // Strict validation against Zod schema
    const validated = AIOutputZodSchema.parse(structuredOutput);

    const latencyMs = Date.now() - startTime;
    return {
      result: validated,
      metadata: {
        provider: 'mock',
        model: 'mock-deterministic-v1',
        latencyMs,
        tokenUsage: {
          promptTokens: 420,
          completionTokens: 260,
          totalTokens: 680,
        },
      },
      rawOutput: JSON.stringify(validated),
    };
  }
}

