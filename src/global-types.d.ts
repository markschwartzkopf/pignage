export type LogData =
  | { [k: string]: number | string | boolean | null | LogData }
  | (number | string | boolean | null | LogData)[];
export type LogType = 'info' | 'error' | 'warn';
export type FileGroup = {
  name: string;
  files: file[];
  thumbnail: string;
  thumbnailWidth: number;
  slideDelay: number;
};
export type ServerMessageGroups = { type: 'groups'; groups: FileGroup[] };
export type ServerMessageActiveSlide = {
  type: 'activeSlide';
  slide: [string, string] | string;
};
export type ServerMessagePlayingGroup = {
  type: 'playingGroup';
  group: string | null;
};
export type ServerIpAddress = {
  type: 'ipAddress';
  address: string;
};
export type ServerMessageCanReboot = {
  type: 'canReboot';
  canReboot: boolean;
}

export type ServerMessage =
  | ServerMessageGroups
  | ServerMessageActiveSlide
  | ServerMessagePlayingGroup
  | ServerIpAddress
  | ServerMessageCanReboot;

type file = {
  name: string;
  url: string;
};

export type ClientMessageActiveSlide = ServerMessageActiveSlide;
export type ClientMessageLog = {
  type: 'log';
  logType: LogType;
  description: string;
  data?: LogData;
};
export type ClientMessagePlayGroup = {
  type: 'playGroup';
  group: string | null;
};
export type ClientMessageRenameGroup = {
  type: 'renameGroup';
  oldName: string;
  newName: string;
};
export type ClientMessageSetSlideDelay = {
  type: 'setSlideDelay';
  group: string;
  delay: number;
};
export type ClientMessageAddGroup = {
  type: 'addGroup';
  name: string;
};
export type ClientMessageRemoveSlide = {
  type: 'removeSlide';
  group: string;
  slide: string;
};
export type ClientMessageRemoveGroup = {
  type: 'removeGroup';
  group: string;
};
export type ClientMessageShowColor = { type: 'showColor'; color: string };
export type ClientMessageReboot = { type: 'reboot' };

export type ClientMessage =
  | ClientMessageActiveSlide
  | ClientMessageLog
  | ClientMessagePlayGroup
  | ClientMessageRenameGroup
  | ClientMessageSetSlideDelay
  | ClientMessageAddGroup
  | ClientMessageRemoveSlide
  | ClientMessageRemoveGroup
  | ClientMessageShowColor
  | ClientMessageReboot;
