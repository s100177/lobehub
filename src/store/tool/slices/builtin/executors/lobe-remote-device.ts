import {
  type DeviceAttachment,
  RemoteDeviceApiName,
  RemoteDeviceManifest,
} from '@lobechat/builtin-tool-remote-device';
import type { BaseExecutor, type BuiltinToolResult, DeviceListItem } from '@lobechat/types';

import { deviceService } from '@/services/device';

const toAttachment = (device: DeviceListItem): DeviceAttachment => ({
  channels: device.channels.map((channel, index) => ({
    channel: channel.channel ?? undefined,
    connectedAt: channel.connectedAt,
    connectionId: device.deviceId + ':' + index,
  })),
  deviceId: device.deviceId,
  hostname: device.hostname ?? device.friendlyName ?? device.deviceId,
  lastSeen: device.lastSeen,
  online: device.online,
  platform: device.platform ?? 'unknown',
});

class RemoteDeviceExecutor extends BaseExecutor<typeof RemoteDeviceApiName> {
  readonly identifier = RemoteDeviceManifest.identifier;
  protected readonly apiEnum = RemoteDeviceApiName;

  listOnlineDevices = async (): Promise<BuiltinToolResult> => {
    try {
      const devices = (await deviceService.listDevices()).map(toAttachment);
      const onlineDevices = devices.filter((device) => device.online);

      return {
        content:
          onlineDevices.length > 0
            ? JSON.stringify(onlineDevices)
            : 'No online devices found. Please make sure your desktop application is running and connected.',
        state: { devices: onlineDevices },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        content: `Failed to list devices: ${message}`,
        error: { body: error, message, type: 'PluginServerError' },
        success: false,
      };
    }
  };

  activateDevice = async (params: { deviceId: string }): Promise<BuiltinToolResult> => {
    try {
      const devices = (await deviceService.listDevices()).map(toAttachment);
      const target = devices.find((device) => device.deviceId === params.deviceId && device.online);

      if (!target) {
        return {
          content: `Device "${params.deviceId}" is not online or does not exist.`,
          success: false,
        };
      }

      return {
        content: `Device "${target.hostname}" (${target.platform}) activated successfully. Local System tools are now available.`,
        state: {
          activatedDevice: target,
          metadata: { activeDeviceId: params.deviceId },
        },
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        content: `Failed to activate device: ${message}`,
        error: { body: error, message, type: 'PluginServerError' },
        success: false,
      };
    }
  };
}

export const remoteDeviceExecutor = new RemoteDeviceExecutor();
