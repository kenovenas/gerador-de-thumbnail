
import React from 'react';

interface StepCardProps {
  stepNumber: number;
  title: string;
  isActive: boolean;
  isComplete: boolean;
  children: React.ReactNode;
}

const StepCard: React.FC<StepCardProps> = ({ stepNumber, title, isActive, isComplete, children }) => {
  const getStatusClasses = () => {
    if (isComplete) {
      return {
        border: 'border-green-700',
        bg: 'bg-gray-800/50',
        iconBg: 'bg-green-600',
        iconText: 'text-white',
        titleText: 'text-gray-400',
      };
    }
    if (isActive) {
      return {
        border: 'border-indigo-600',
        bg: 'bg-gray-800',
        iconBg: 'bg-indigo-600',
        iconText: 'text-white',
        titleText: 'text-white',
      };
    }
    return {
      border: 'border-gray-700',
      bg: 'bg-gray-800/30',
      iconBg: 'bg-gray-700',
      iconText: 'text-gray-400',
      titleText: 'text-gray-500',
    };
  };

  const { border, bg, iconBg, iconText, titleText } = getStatusClasses();

  return (
    <div className={`border-2 ${border} ${bg} rounded-lg p-6 transition-all duration-500`}>
      <div className="flex items-center mb-4">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconBg} ${iconText} font-bold text-sm mr-4`}>
          {isComplete ? <i className="fas fa-check"></i> : stepNumber}
        </div>
        <h2 className={`text-xl font-bold ${titleText}`}>{title}</h2>
      </div>
      {isActive && <div className="pl-12">{children}</div>}
    </div>
  );
};

export default StepCard;
