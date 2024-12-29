import { LogData, LogType } from '../global-types';

let logNumber = 0;
export function log(
  source: string,
  type: LogType,
  description: string,
  data?: LogData
) {
  logNumber++;
  console[type](`${source} ${type} Log#:${logNumber}, "${description}"`);
  if (data)
    console[type](
      `${source} ${type} Log#:${logNumber} data: "${JSON.stringify(data)}"`
    );
}
