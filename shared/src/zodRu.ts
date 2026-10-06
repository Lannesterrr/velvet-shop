/**
 * Русские сообщения об ошибках zod по умолчанию
 * (для полей, где в схеме не задано своё сообщение).
 */
import { z, ZodIssueCode, type ZodErrorMap } from 'zod';

const ruErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Обязательное поле' };
      if (issue.expected === 'number' || issue.received === 'nan') return { message: 'Введите число' };
      return { message: 'Некорректное значение' };
    case ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'Заполните поле' : `Минимум ${issue.minimum} символов` };
      if (issue.type === 'number') return { message: `Значение должно быть не меньше ${issue.minimum}` };
      if (issue.type === 'array') return { message: `Нужно хотя бы ${issue.minimum}` };
      break;
    case ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Максимум ${issue.maximum} символов` };
      if (issue.type === 'number') return { message: `Значение должно быть не больше ${issue.maximum}` };
      if (issue.type === 'array') return { message: `Не больше ${issue.maximum}` };
      break;
    case ZodIssueCode.invalid_enum_value:
      return { message: 'Выберите значение из списка' };
    case ZodIssueCode.invalid_string:
      return { message: 'Некорректный формат' };
    case ZodIssueCode.not_finite:
      return { message: 'Введите число' };
    default:
      break;
  }
  return { message: ctx.defaultError };
};

z.setErrorMap(ruErrorMap);
