import type { Platform } from '@/types/domain';
import { PLATFORMS } from '@/types/domain';
import type { PlatformConfigStatus, SocialPlatformService } from '@/services/types';
import { YouTubeService } from '@/services/youtube/youtube.service';
import { TikTokService } from '@/services/tiktok/tiktok.service';
import { InstagramService } from '@/services/instagram/instagram.service';
import { FacebookService } from '@/services/facebook/facebook.service';

const serviceInstances: Record<Platform, SocialPlatformService> = {
  youtube: new YouTubeService(),
  tiktok: new TikTokService(),
  instagram: new InstagramService(),
  facebook: new FacebookService(),
};

export function getPlatformService(platform: Platform): SocialPlatformService {
  return serviceInstances[platform];
}

export function getAllPlatformConfigStatuses(): Record<Platform, PlatformConfigStatus> {
  return {
    youtube: serviceInstances.youtube.getConfigStatus(),
    tiktok: serviceInstances.tiktok.getConfigStatus(),
    instagram: serviceInstances.instagram.getConfigStatus(),
    facebook: serviceInstances.facebook.getConfigStatus(),
  };
}

export function listSupportedPlatforms(): readonly Platform[] {
  return PLATFORMS;
}
