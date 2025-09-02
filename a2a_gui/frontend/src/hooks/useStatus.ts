import { useState, useEffect, useCallback } from 'react';
import type { AgentStatus, ConnectionInfo, ConnectionStatus } from '../types';
import { api } from '../services/api';

export const useStatus = (addMessage: (type: 'info' | 'error', content: string) => void) => {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ available: false });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const status = await api.checkAgentStatus();
      setAgentStatus(status);
      if (status.available) {
        const connInfo = await api.getConnectionInfo();
        setConnectionInfo(connInfo);
        setConnectionStatus(connInfo.connected ? 'CONNECTED' : 'DISCONNECTED');
      }
    } catch {
      setAgentStatus({ available: false });
      setConnectionStatus('ERROR');
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000); // Re-check every 10 seconds
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleConnect = async () => {
    setConnectionStatus('CONNECTING');
    addMessage('info', 'Attempting to connect to vehicle...');
    try {
      // Try to connect with auto-detection first
      let response = await api.connectObd();
      let data = await response.json();
      
      // If auto-detection fails, try with the Bluetooth OBD port we found
      if (!response.ok || !data.success) {
        addMessage('info', 'Auto-detection failed, trying Bluetooth OBD port...');
        const config = {
          port: '/dev/tty.OBDII',
          baudrate: 38400,
          timeout: 30.0,
          protocol: 'auto',
          auto_detect: true,
          max_retries: 3
        };
        response = await api.connectObd(config);
        data = await response.json();
      }
      
      if (response.ok && data.success) {
        setConnectionStatus('CONNECTED');
        setConnectionInfo({ connected: true, ...data.data });
        addMessage('info', '✅ Successfully connected to vehicle!');
      } else {
        throw new Error(data.error_message || 'Failed to connect');
      }
    } catch (e: unknown) {
      setConnectionStatus('ERROR');
      const message = e instanceof Error ? e.message : String(e);
      addMessage('error', `Connection Error: ${message}`);
    }
  };

  const handleDisconnect = async () => {
    addMessage('info', 'Disconnecting from vehicle...');
    try {
      await api.disconnectObd();
      setConnectionStatus('DISCONNECTED');
      setConnectionInfo({ connected: false });
      addMessage('info', '🔌 Vehicle disconnected.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      addMessage('error', `Failed to disconnect: ${message}`);
    }
  };

  return {
    agentStatus,
    connectionStatus,
    connectionInfo,
    handleConnect,
    handleDisconnect,
  };
};
