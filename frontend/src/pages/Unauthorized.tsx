import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export const Unauthorized: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center space-y-6 bg-white p-8 rounded-2xl shadow-md border border-gray-100">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
            <ShieldAlert size={36} />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-800">Access Denied</h2>
          <p className="text-gray-500 text-sm font-medium">
            You do not have the required operational permissions to view this screen.
          </p>
        </div>
        <div>
          <Link
            to="/"
            className="inline-flex justify-center px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-opacity-90 transition-all shadow-sm active:scale-95"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};
export default Unauthorized;
