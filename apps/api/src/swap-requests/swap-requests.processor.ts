import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  EXPIRE_DROP_JOB,
  SWAP_REQUESTS_QUEUE,
} from './swap-requests.constants';
import { SwapRequestsService } from './swap-requests.service';

@Processor(SWAP_REQUESTS_QUEUE)
export class SwapRequestsProcessor extends WorkerHost {
  constructor(private readonly swapRequestsService: SwapRequestsService) {
    super();
  }

  async process(job: Job<{ requestId: string }>): Promise<void> {
    if (job.name !== EXPIRE_DROP_JOB) {
      return;
    }

    const requestId = job.data.requestId;
    if (!requestId) {
      return;
    }

    await this.swapRequestsService.expirePendingDropRequest(requestId);
  }
}
